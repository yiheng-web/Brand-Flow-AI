// 必须使用专用本机测试实例；随机数据库、队列前缀与凭据不会接触用户数据或付费模型。
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { randomUUID, randomBytes } = require('node:crypto')
const { startS3Fixture } = require('./garage-fixture.cjs')
const root = path.resolve(__dirname, '..')
const apiRequire = Module.createRequire(path.join(root, 'apps/api/package.json'))
const mongoUri = process.argv[2]
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):27018\/?$/.test(mongoUri ?? ''))
  throw new Error(
    '用法：node scripts/smoke-runtime-v1.cjs mongodb://127.0.0.1:27018；Redis专用实例6381',
  )
process.env.BRAND_FLOW_DEMO_MODE = 'true'
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
apiRequire('reflect-metadata')
const { Module: NestModule, ValidationPipe } = apiRequire('@nestjs/common')
const { NestFactory } = apiRequire('@nestjs/core')
const { ConfigModule } = apiRequire('@nestjs/config')
const { MongooseModule, getConnectionToken, getModelToken } = apiRequire('@nestjs/mongoose')
const { BullModule, getQueueToken } = apiRequire('@nestjs/bullmq')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
const { AuthModule } = apiRequire('./dist/modules/auth/auth.module')
const { WorkflowModule } = apiRequire('./dist/modules/workflow/workflow.module')
const { HealthModule } = apiRequire('./dist/modules/health/health.module')
const { LimitsService } = apiRequire('./dist/modules/limits/limits.service')
const { WorkflowService } = apiRequire('./dist/modules/workflow/workflow.service')
const { WorkflowProcessor } = apiRequire('./dist/modules/workflow/workflow.processor')
const { WorkflowRecoveryService } = apiRequire('./dist/modules/workflow/workflow-recovery.service')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { WORKFLOW_QUEUE } = apiRequire('./dist/modules/workflow/workflow.constants')
Module._resolveFilename = originalResolve

async function main() {
  const dbName = `codex_runtime_v1_${Date.now()}_${randomUUID().slice(0, 8)}`
  const access = `GK${randomBytes(16).toString('hex')}`
  const secret = randomBytes(32).toString('hex')
  const fixture = await startS3Fixture(access, secret, 'runtime-v1')
  let app
  let queue
  try {
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
              MINIO_PORT: fixture.port,
              MINIO_ACCESS_KEY: access,
              MINIO_SECRET_KEY: secret,
              MINIO_BUCKET: 'runtime-v1',
              AUTH_RATE_LIMIT: 3,
              AUTH_RATE_WINDOW_SECONDS: 60,
              WORKFLOW_RUNNING_LIMIT: 1,
              WORKFLOW_RETRY_LIMIT: 2,
              IMAGE_DAILY_LIMIT: 4,
            }),
          ],
        }),
        MongooseModule.forRoot(mongoUri, { dbName }),
        BullModule.forRoot({ prefix: dbName, connection: { host: '127.0.0.1', port: 6381 } }),
        AuthModule,
        WorkflowModule,
        HealthModule,
      ],
    })(SmokeApp)
    app = await NestFactory.create(SmokeApp, { logger: ['error'] })
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new TransformInterceptor())
    app.useGlobalFilters(new AllExceptionsFilter())
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl()
    queue = app.get(getQueueToken(WORKFLOW_QUEUE))
    await queue.pause()
    const post = (route, body) =>
      fetch(`${base}/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    const password = `Aa1!${randomUUID()}`
    const users = []
    for (const name of ['a', 'b']) {
      const email = `${name}-${randomUUID()}@example.test`
      assert.equal((await post('auth/register', { email, password, nickname: name })).status, 201)
      const login = await post('auth/login', { email, password })
      assert.equal(login.status, 200)
      users.push((await login.json()).data.user.id)
    }
    assert.equal(
      (await post('auth/login', { email: 'missing@example.test', password })).status,
      401,
    )
    const blocked = await post('auth/login', { email: 'missing@example.test', password })
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
    assert.match((await blocked.json()).message, /频繁/)
    const limits = app.get(LimitsService)
    const leases = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) => limits.reserve(users[0], `concurrent-${index}`)),
    )
    assert.equal(leases.filter((item) => item.status === 'fulfilled').length, 1)
    assert.equal(
      leases.filter((item) => item.status === 'rejected' && item.reason.getStatus() === 429).length,
      7,
    )
    await limits.release(users[0], leases.find((item) => item.status === 'fulfilled').value)
    await limits.images(users[0], 4)
    await assert.rejects(limits.images(users[0], 1), (error) => error.getStatus() === 429)
    await limits.images(users[1], 4)
    await limits.retry('retry-fixture')
    await limits.retry('retry-fixture')
    await assert.rejects(limits.retry('retry-fixture'), (error) => error.getStatus() === 429)
    const service = app.get(WorkflowService)
    const first = await service.create({ prompt: '取消验证', spaceId: 'personal' }, users[0])
    const second = await service.create({ prompt: '并发验证', spaceId: 'personal' }, users[0])
    await service.start(first.id, { needsComposition: false }, users[0])
    await assert.rejects(
      service.start(second.id, { needsComposition: false }, users[0]),
      (error) => error.getStatus() === 429,
    )
    const model = app.get(getModelToken('Workflow'))
    const running = await model.findById(first.id)
    const processor = app.get(WorkflowProcessor)
    let attempts = 0
    const retry = processor.executeWithRetry(
      running,
      'brief',
      async () => {
        attempts += 1
        throw new Error('provider timeout')
      },
      3,
    )
    const rejected = assert.rejects(retry, /版本或状态已改变/)
    await new Promise((done) => setTimeout(done, 80))
    await service.cancel(first.id, users[0])
    await rejected
    assert.equal(attempts, 1, '取消后不能进行下一次Provider重试')
    await assert.rejects(processor.generateWithQuota(running, {}), /版本或状态已改变/)
    await service.start(second.id, { needsComposition: false }, users[0])
    const secondDoc = await model.findById(second.id)
    await queue.remove(`${second.id}-r${secondDoc.runVersion}-brief`)
    await model.collection.updateOne(
      { _id: secondDoc._id },
      {
        $set: { updatedAt: new Date(Date.now() - limits.leaseMs - 1000) },
      },
    )
    await app.get(WorkflowRecoveryService).reconcile()
    assert.equal((await model.findById(second.id)).status, 'failed')
    const userModel = app.get(getModelToken('User'))
    const orphan = `${new (apiRequire('mongoose').Types.ObjectId)()}/${Date.now() - limits.leaseMs - 1000}/${randomUUID()}`
    await userModel.updateOne({ _id: users[0] }, { $push: { runningWorkflowLeases: orphan } })
    await app.get(WorkflowRecoveryService).reconcile()
    assert.deepEqual((await userModel.findById(users[0])).runningWorkflowLeases, [])
    await queue.resume()
    assert.equal((await fetch(`${base}/health/live`)).status, 200)
    const ready = await fetch(`${base}/health/ready`)
    assert.equal(ready.status, 200)
    assert.deepEqual((await ready.json()).data.checks, {
      mongo: 'ready',
      redis: 'ready',
      bullmq: 'ready',
      storage: 'ready',
    })
    await fixture.close()
    const unavailable = await fetch(`${base}/health/ready`)
    assert.equal(unavailable.status, 503)
    assert.equal((await unavailable.json()).data.checks.storage, 'unavailable')
    assert.equal((await fetch(`${base}/health/live`)).status, 200)
    console.log(
      'PASS：真实Mongo/Redis/Nest HTTP：双账号、429/Retry-After、原子并发、独立生图额度、重试额度、取消阻止重试/生图、孤儿任务对账、readiness失败与liveness',
    )
  } finally {
    if (app) {
      const connection = app.get(getConnectionToken())
      assert.equal(connection.name, dbName)
      if (queue) {
        await queue.pause()
        await queue.obliterate({ force: true })
        const client = await queue.client
        let cursor = '0'
        do {
          const scan = await client.scan(cursor, 'MATCH', `${dbName}:v1-limits:*`, 'COUNT', 100)
          cursor = scan[0]
          if (scan[1].length) await client.del(...scan[1])
        } while (cursor !== '0')
      }
      await connection.dropDatabase()
      await app.close()
    }
    await fixture.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
