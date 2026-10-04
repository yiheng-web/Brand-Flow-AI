// 使用现有 Playwright 和本机 Edge，验证独立浏览器会话从真实 Mongo 恢复任务；不读取 .env。
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const apiRequire = Module.createRequire(path.join(root, 'apps/api/package.json'))
const webRequire = Module.createRequire(path.join(root, 'apps/web/package.json'))
const [mongoUri, runtimeModules] = process.argv.slice(2)
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(mongoUri ?? '') || !runtimeModules) {
  throw new Error(
    '用法：node scripts/smoke-workflow-browser.cjs mongodb://127.0.0.1:27018 <已有运行时的 node_modules 路径>；Redis 6381 必须为专用临时实例',
  )
}
process.env.BRAND_FLOW_DEMO_MODE = 'true'
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
apiRequire('reflect-metadata')
const { Module: NestModule, ValidationPipe } = apiRequire('@nestjs/common')
const { NestFactory } = apiRequire('@nestjs/core')
const { ConfigModule } = apiRequire('@nestjs/config')
const { MongooseModule, getConnectionToken } = apiRequire('@nestjs/mongoose')
const { BullModule } = apiRequire('@nestjs/bullmq')
const { Queue } = apiRequire('bullmq')
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
const { AuthModule } = apiRequire('./dist/modules/auth/auth.module')
const { WorkflowModule } = apiRequire('./dist/modules/workflow/workflow.module')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
const { WORKFLOW_QUEUE } = apiRequire('./dist/modules/workflow/workflow.constants')
Module._resolveFilename = resolve
const agentRequire = Module.createRequire(path.join(root, 'packages/agent/package.json'))
const core = agentRequire('./dist/v1-workflow')
const originalBrief = core.createCreativeBrief

async function main() {
  const dbName = `codex_workflow_browser_${Date.now()}`
  const queue = new Queue(WORKFLOW_QUEUE, { connection: { host: '127.0.0.1', port: 6381 } })
  let ownsQueue = false
  let app
  let vite
  let browser
  try {
    assert.equal(
      await queue.getJobCountByTypes('waiting', 'active', 'completed', 'failed', 'delayed'),
      0,
    )
    ownsQueue = true
    class SmokeApp {}
    NestModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: randomUUID(),
              MINIO_ENDPOINT: '127.0.0.1',
              MINIO_ACCESS_KEY: randomUUID(),
              MINIO_SECRET_KEY: randomUUID(),
              MINIO_BUCKET: 'smoke',
            }),
          ],
        }),
        MongooseModule.forRoot(mongoUri, { dbName }),
        BullModule.forRoot({ connection: { host: '127.0.0.1', port: 6381 } }),
        AuthModule,
        WorkflowModule,
      ],
    })(SmokeApp)
    app = await NestFactory.create(SmokeApp, { logger: ['error'] })
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new TransformInterceptor())
    app.useGlobalFilters(new AllExceptionsFilter())
    app.setGlobalPrefix('api')
    await app.listen(3088, '127.0.0.1')
    const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
    vite = await createServer({
      root: path.join(root, 'apps/web'),
      server: {
        host: '127.0.0.1',
        port: 5189,
        strictPort: true,
        proxy: { '/api': { target: 'http://127.0.0.1:3088', changeOrigin: true } },
      },
    })
    await vite.listen()
    const { chromium } = require(path.join(runtimeModules, 'playwright'))
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const password = `${randomUUID()}aA1!`
    const email = `workflow-${randomUUID()}@example.test`
    const request = async (route, body, token) => {
      const result = await fetch(`http://127.0.0.1:3088/api/${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      assert.equal(result.ok, true, `HTTP ${result.status}: ${route}`)
      return (await result.json()).data
    }
    await request('auth/register', { email, password, nickname: '任务恢复验收' })
    const login = await request('auth/login', { email, password })
    const authState = {
      state: {
        isLoggedIn: true,
        token: login.access_token,
        user: { id: login.user.id, name: '任务恢复验收', email },
      },
      version: 0,
    }
    const createSession = async () => {
      const context = await browser.newContext()
      await context.addInitScript(
        (auth) => localStorage.setItem('brand-flow-auth', JSON.stringify(auth)),
        authState,
      )
      return { context, page: await context.newPage() }
    }
    const task = await request(
      'workflows/create',
      { prompt: '跨设备恢复咖啡海报', spaceId: 'personal' },
      login.access_token,
    )
    core.createCreativeBrief = async (...args) => {
      await new Promise((done) => setTimeout(done, 1500))
      return originalBrief(...args)
    }
    const first = await createSession()
    await first.page.goto(`http://127.0.0.1:5189/workspace?workflowId=${task.id}`)
    await first.page.getByRole('button', { name: '运行工作流' }).waitFor()
    await first.page.getByRole('button', { name: '运行工作流' }).click()
    const started = first.page.waitForResponse(
      (response) =>
        response.url().endsWith(`/workflows/${task.id}/start`) ||
        response.url().endsWith(`/workflow/${task.id}/start`),
    )
    await first.page.getByRole('button', { name: '不需要', exact: true }).click()
    await started
    await first.context.close()
    const second = await createSession()
    await second.page.goto('http://127.0.0.1:5189/tasks')
    await second.page.getByRole('heading', { name: '跨设备恢复咖啡海报' }).waitFor()
    await second.page.getByRole('button', { name: '继续创作' }).click()
    await second.page.getByRole('button', { name: '确认 Brief', exact: true }).waitFor()
    await second.page.reload()
    await second.page.getByRole('button', { name: '确认 Brief', exact: true }).waitFor()
    const workflowCache = await second.page.evaluate(() =>
      localStorage.getItem('brand-flow-workflow'),
    )
    if (workflowCache)
      assert.deepEqual(Object.keys(JSON.parse(workflowCache).state), ['workflowId'])
    await second.page.goto('http://127.0.0.1:5189/tasks')
    await second.page.getByRole('button', { name: '取消任务' }).click()
    await second.page.getByText('已取消', { exact: true }).waitFor()
    assert.equal(await second.page.getByRole('button', { name: '继续创作' }).count(), 0)
    await second.page.getByRole('button', { name: '查看任务' }).click()
    await second.page.getByText('cancelled', { exact: true }).waitFor()
    assert.equal(await second.page.getByRole('button', { name: '从此节点重跑' }).isEnabled(), false)
    await second.context.close()
    console.log(
      'PASS：真实 Edge 会话 A 启动后关闭，会话 B 无任务缓存从历史继续；刷新恢复 Brief；取消任务只读且不能重跑',
    )
  } finally {
    core.createCreativeBrief = originalBrief
    await browser?.close()
    await vite?.close()
    if (app) {
      const connection = app.get(getConnectionToken())
      assert.equal(connection.name, dbName)
      await app.close()
      const cleanupConnection = await apiRequire('mongoose')
        .createConnection(mongoUri, { dbName })
        .asPromise()
      try {
        await cleanupConnection.dropDatabase()
      } finally {
        await cleanupConnection.close()
      }
    }
    if (ownsQueue) await queue.obliterate({ force: true })
    await queue.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
