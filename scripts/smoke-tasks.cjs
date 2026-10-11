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
const { BullModule, getQueueToken } = apiRequire('@nestjs/bullmq')
process.env.BRAND_FLOW_DEMO_MODE = 'true'
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
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
const WorkflowService = load('WorkflowService', 'workflow/workflow.service')
const WorkflowProcessor = load('WorkflowProcessor', 'workflow/workflow.processor')
const StorageService = load('StorageService', 'storage/storage.service')
const WorksModule = load('WorksModule', 'works/works.module')
const KnowledgeModule = load('KnowledgeModule', 'knowledge/knowledge.module')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
Module._resolveFilename = resolve

async function main() {
  const dbName = `codex_tasks_${Date.now()}_${randomUUID().slice(0, 8)}`
  const secret = randomUUID()
  let app, connection, vite, browser, s3Fixture, queue
  try {
    const { startS3Fixture } = require('./garage-fixture.cjs')
    const access = `GK${randomUUID().replaceAll('-', '')}`
    const storageSecret = randomUUID()
    s3Fixture = await startS3Fixture(access, storageSecret, 'v3-tasks')
    class SmokeApp {}
    NestModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: secret,
              REDIS_HOST: '127.0.0.1',
              REDIS_PORT: 6381,
              MINIO_ENDPOINT: '127.0.0.1',
              MINIO_PORT: s3Fixture.port,
              MINIO_ACCESS_KEY: access,
              MINIO_SECRET_KEY: storageSecret,
              MINIO_BUCKET: 'v3-tasks',
            }),
          ],
        }),
        MongooseModule.forRoot(mongoUri, { dbName, directConnection: true }),
        OrgModule,
        TasksModule,
        WorksModule,
        KnowledgeModule,
        BullModule.forRoot({ prefix: dbName, connection: { host: '127.0.0.1', port: 6381 } }),
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
    queue = app.get(getQueueToken('workflow'))
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
    const workflowService = app.get(WorkflowService)
    const enterpriseKnowledge = await request(actors.owner, 'POST', 'knowledge', {
      spaceId: enterprise._id,
      name: '企业强制知识',
      isRequired: true,
    })
    await request(actors.owner, 'POST', `knowledge/${enterpriseKnowledge._id}/items`, {
      title: '品牌规范',
      content: '保持品牌规范',
      constraintLevel: 'required',
    })
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/start`,
      { teamId, version: task.version },
      403,
    )
    task = await request(actors.member, 'POST', `tasks/${task.id}/start`, {
      teamId,
      version: task.version,
    })
    assert.equal(task.status, 'in_progress')
    const workflowId = task.activeWorkflowId
    assert.ok(workflowId)
    await request(
      actors.member,
      'POST',
      `tasks/${task.id}/start`,
      { teamId, version: task.version },
      409,
    )
    assert.equal(await model('Workflow').countDocuments({ taskId: task.id }), 1)
    const workflow = await model('Workflow').findById(workflowId)
    assert.equal(workflow.spaceId, teamId)
    assert.equal(workflow.taskId, task.id)
    assert.ok(workflow.selectedKnowledgeBaseIds.includes(enterpriseKnowledge._id))
    await request(
      actors.admin,
      'POST',
      `workflows/${workflowId}/start`,
      { needsComposition: false },
      403,
    )
    await request(
      actors.member,
      'POST',
      `workflows/${workflowId}/start`,
      { needsComposition: true },
      400,
    )
    const until = async (predicate) => {
      for (let attempt = 0; attempt < 300; attempt++) {
        const current = await model('Workflow').findById(workflowId)
        if (predicate(current)) return current
        assert.notEqual(current.status, 'failed', current.errorMessage)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error('Task 工作流执行超时')
    }
    await workflowService.start(workflowId, { needsComposition: false }, actors.member.id)
    await until((flow) => flow.awaitingAction === 'confirm_brief')
    await workflowService.confirmBrief(workflowId, actors.member.id)
    const directions = await until((flow) => flow.awaitingAction === 'select_direction')
    await workflowService.updateNodeOutput(
      workflowId,
      'creativeDirection',
      { selectedDirectionId: directions.result.creativeDirection.directions[0].id },
      actors.member.id,
    )
    const storage = app.get(StorageService)
    const importPng = storage.importRemotePng.bind(storage)
    storage.importRemotePng = async () => {
      throw new Error('验收注入：对象存储暂不可用')
    }
    await workflowService.runNode(workflowId, 'prompt', actors.member.id)
    await until((flow) => flow.status === 'failed')
    const failedTask = await request(actors.member, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    assert.equal(failedTask.status, 'in_progress')
    assert.equal(failedTask.activeWorkflowId, workflowId)
    assert.match(failedTask.progress.executionError, /对象存储暂不可用/)
    storage.importRemotePng = importPng
    await workflowService.retry(workflowId, actors.member.id)
    const generated = await until((flow) => flow.awaitingAction === 'select_candidate')
    await workflowService.updateNodeOutput(
      workflowId,
      'generate',
      { selectedCandidateId: generated.result.generate.candidates[0].id },
      actors.member.id,
    )
    await workflowService.runNode(workflowId, 'compose', actors.member.id)
    await until((flow) => flow.status === 'completed')
    const progressed = await request(actors.viewer, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    assert.equal(progressed.progress.status, 'completed')
    assert.equal(progressed.status, 'in_progress')
    let cancelledTask = await request(actors.owner, 'POST', 'tasks', {
      ...input,
      title: '取消隔离测试',
    })
    cancelledTask = await request(actors.owner, 'POST', `tasks/${cancelledTask.id}/assign`, {
      teamId,
      version: cancelledTask.version,
      assigneeId: actors.member.id,
    })
    cancelledTask = await request(actors.member, 'POST', `tasks/${cancelledTask.id}/accept`, {
      teamId,
      version: cancelledTask.version,
    })
    cancelledTask = await request(actors.member, 'POST', `tasks/${cancelledTask.id}/start`, {
      teamId,
      version: cancelledTask.version,
    })
    const cancelledWorkflowId = cancelledTask.activeWorkflowId
    const oldVersion = (await model('Workflow').findById(cancelledWorkflowId)).runVersion
    cancelledTask = await request(actors.owner, 'POST', `tasks/${cancelledTask.id}/cancel`, {
      teamId,
      version: cancelledTask.version,
    })
    const cancelledWorkflow = await model('Workflow').findById(cancelledWorkflowId)
    assert.equal(cancelledWorkflow.status, 'cancelled')
    assert.equal(cancelledWorkflow.runVersion, oldVersion + 1)
    await app.get(WorkflowProcessor).process({
      name: 'run-workflow',
      data: { workflowId: cancelledWorkflowId, runVersion: oldVersion },
    })
    assert.equal((await model('Workflow').findById(cancelledWorkflowId)).status, 'cancelled')
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
    await page.getByRole('link', { name: '继续创作 / 查看结果' }).click()
    await page.getByRole('button', { name: '团队任务 · 返回详情' }).waitFor()
    await page
      .getByRole('dialog', { name: '本次创作已完成' })
      .getByRole('button', { name: /关\s*闭/ })
      .click()
    await page.getByRole('button', { name: '团队任务 · 返回详情' }).click()
    await page.reload()
    await page.getByText('任务时间线', { exact: true }).waitFor()
    await login('viewer')
    await page.goto(`${webUrl}team-tasks/${task.id}?teamId=${teamId}`)
    await page.getByText('任务时间线', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '取消任务', exact: true }).count(), 0)
    console.log(
      'PASS：Task 五角色、派发接收、Mongo/Redis/S3 七节点 Demo、固定组织与强制知识、旧 worker 取消隔离、浏览器工作台与刷新',
    )
  } finally {
    await browser?.close()
    await vite?.close()
    await queue?.obliterate({ force: true })
    if (connection) await connection.dropDatabase()
    await app?.close()
    await s3Fixture?.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
