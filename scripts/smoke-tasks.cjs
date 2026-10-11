const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '..')
const apiRequire = Module.createRequire(path.join(root, 'apps/api/package.json'))
const webRequire = Module.createRequire(path.join(root, 'apps/web/package.json'))
const [mongoUri, browserModules] = process.argv.slice(2)
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):27019\/?$/.test(mongoUri ?? '') || !browserModules)
  throw new Error('需要专用 Mongo27019 副本集与 Playwright 模块目录')
apiRequire('reflect-metadata')
const { Module: NestModule, ValidationPipe } = apiRequire('@nestjs/common')
const { NestFactory } = apiRequire('@nestjs/core')
const { ConfigModule } = apiRequire('@nestjs/config')
const { MongooseModule, getConnectionToken, getModelToken } = apiRequire('@nestjs/mongoose')
const { JwtModule } = apiRequire('@nestjs/jwt')
const { PassportModule } = apiRequire('@nestjs/passport')
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
const load = (name, file) => apiRequire(`./dist/modules/${file}`)[name]
const OrgModule = load('OrgModule', 'org/org.module')
const TasksModule = load('TasksModule', 'tasks/tasks.module')
const AuthService = load('AuthService', 'auth/auth.service')
const JwtStrategy = load('JwtStrategy', 'auth/guards/jwt.strategy')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
Module._resolveFilename = resolve

async function main() {
  const dbName = `codex_tasks_${Date.now()}_${randomUUID().slice(0, 8)}`
  const secret = randomUUID()
  let app, connection, vite, browser
  try {
    class SmokeApp {}
    NestModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: secret })],
        }),
        MongooseModule.forRoot(mongoUri, { dbName, directConnection: true }),
        OrgModule,
        TasksModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      providers: [AuthService, JwtStrategy],
    })(SmokeApp)
    app = await NestFactory.create(SmokeApp, { logger: ['error'] })
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new TransformInterceptor())
    app.useGlobalFilters(new AllExceptionsFilter())
    await app.listen(0, '127.0.0.1')
    connection = app.get(getConnectionToken())
    const model = (name) => app.get(getModelToken(name))
    await Promise.all(
      ['User', 'Enterprise', 'Team', 'Task', 'AuditLog', 'Notification'].map((name) =>
        model(name).init(),
      ),
    )
    const auth = app.get(AuthService)
    const password = randomUUID()
    const actors = {}
    for (const role of ['owner', 'admin', 'member', 'viewer', 'outsider']) {
      const email = `${role}@example.test`
      await auth.register({ email, password, nickname: role })
      actors[role] = await auth.login({ email, password })
      actors[role].id = (await model('User').findOne({ email })).id
    }
    const request = async (actor, method, route, body, expected) => {
      const response = await fetch(`${await app.getUrl()}/api/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${actor.access_token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const result = await response.json()
      assert.equal(
        response.status,
        expected ?? (method === 'POST' ? 201 : 200),
        `${method} ${route}: ${JSON.stringify(result)}`,
      )
      return result.data
    }
    const enterprise = await request(actors.owner, 'POST', 'org/enterprise', {
      name: 'Task 验收企业',
    })
    const team = await request(actors.owner, 'POST', 'org/team', {
      enterpriseId: enterprise._id,
      name: '设计团队',
    })
    const teamId = team._id
    for (const role of ['admin', 'member', 'viewer'])
      await model('User').updateOne(
        { _id: actors[role].id },
        {
          $set: {
            memberships: [
              { enterpriseId: enterprise._id, role },
              { enterpriseId: enterprise._id, teamId, role },
            ],
          },
        },
      )
    const input = {
      teamId,
      title: '新品品牌海报',
      deadline: '2020-01-01T00:00:00Z',
      requirementSnapshot: { prompt: '新品品牌海报', needsComposition: false },
    }
    await request(actors.member, 'POST', 'tasks', input, 403)
    await request(actors.viewer, 'POST', 'tasks', input, 403)
    let task = await request(actors.owner, 'POST', 'tasks', {
      ...input,
      creatorId: actors.outsider.id,
      status: 'completed',
    })
    assert.equal(task.creatorId, actors.owner.id)
    assert.equal(task.status, 'draft')
    assert.equal(task.overdue, true)
    await request(actors.outsider, 'GET', `tasks/${task.id}?teamId=${teamId}`, undefined, 403)
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/assign`,
      { teamId, version: task.version, assigneeId: actors.viewer.id },
      400,
    )
    task = await request(actors.admin, 'POST', `tasks/${task.id}/assign`, {
      teamId,
      version: task.version,
      assigneeId: actors.member.id,
    })
    const notifications = await request(actors.member, 'GET', 'org/notifications')
    assert.ok(
      notifications.some(
        (notification) =>
          notification.resourceId === task.id && notification.action === 'task.assign',
      ),
    )
    await request(
      actors.viewer,
      'POST',
      `tasks/${task.id}/accept`,
      { teamId, version: task.version },
      403,
    )
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/accept`,
      { teamId, version: task.version },
      403,
    )
    task = await request(actors.member, 'POST', `tasks/${task.id}/decline`, {
      teamId,
      version: task.version,
      reason: '需要重新安排',
    })
    assert.equal(task.status, 'draft')
    assert.equal(task.assigneeId, undefined)
    assert.equal(task.declineReason, '需要重新安排')
    task = await request(actors.owner, 'POST', `tasks/${task.id}/assign`, {
      teamId,
      version: task.version,
      assigneeId: actors.member.id,
    })
    task = await request(actors.member, 'POST', `tasks/${task.id}/accept`, {
      teamId,
      version: task.version,
    })
    assert.equal(task.status, 'accepted')
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/cancel`,
      { teamId, version: task.version - 1 },
      409,
    )
    const mine = await request(
      actors.member,
      'GET',
      `tasks?teamId=${teamId}&view=mine&deadline=overdue`,
    )
    assert.equal(mine.items[0].id, task.id)
    const events = await request(actors.viewer, 'GET', `tasks/${task.id}/timeline?teamId=${teamId}`)
    assert.deepEqual(
      events.map((event) => event.action),
      ['task.created', 'task.assign', 'task.decline', 'task.assign', 'task.accept'],
    )
    const foreign = await request(actors.outsider, 'POST', 'org/enterprise', { name: '外部企业' })
    const foreignTeam = await request(actors.outsider, 'POST', 'org/team', {
      enterpriseId: foreign._id,
      name: '外部团队',
    })
    await request(
      actors.outsider,
      'GET',
      `tasks/${task.id}?teamId=${foreignTeam._id}`,
      undefined,
      404,
    )
    const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
    vite = await createServer({
      root: path.join(root, 'apps/web'),
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': await app.getUrl() } },
    })
    await vite.listen()
    const { chromium } = require(path.join(browserModules, 'playwright'))
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    let page
    const webUrl = vite.resolvedUrls.local[0]
    const login = async (role) => {
      const context = await browser.newContext()
      await context.addInitScript(
        (account) =>
          localStorage.setItem(
            'brand-flow-auth',
            JSON.stringify({
              state: {
                isLoggedIn: true,
                token: account.access_token,
                user: {
                  id: account.id,
                  email: account.user.email,
                  name: account.user.profile.nickname,
                },
              },
              version: 0,
            }),
          ),
        actors[role],
      )
      page = await context.newPage()
    }
    await login('member')
    await page.goto(`${webUrl}team-tasks`)
    await page.getByRole('link', { name: '新品品牌海报' }).waitFor()
    await page.getByRole('link', { name: '新品品牌海报' }).click()
    await page.getByText('任务时间线', { exact: true }).waitFor()
    await page.reload()
    await page.getByText('任务时间线', { exact: true }).waitFor()
    await login('viewer')
    await page.goto(`${webUrl}team-tasks/${task.id}?teamId=${teamId}`)
    await page.getByText('任务时间线', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '取消任务', exact: true }).count(), 0)
    console.log(
      'PASS：真实 Mongo 副本集 Task 创建/派发/拒绝/再派发/接受、通知、五角色、跨租户、过期版本、浏览器看板与刷新',
    )
  } finally {
    await browser?.close()
    await vite?.close()
    if (connection) await connection.dropDatabase()
    await app?.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
