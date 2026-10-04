// 仅连接显式指定的本机临时 Mongo/Redis；Demo 模式不会调用付费 Provider。
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { createRequire } = Module
const root = path.resolve(__dirname, '..')
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'))
const mongoose = apiRequire('mongoose')
const { Queue, Worker } = apiRequire('bullmq')
const mongoUri = process.argv[2]
const redisPort = Number(process.argv[3])
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(mongoUri ?? '') || redisPort !== 6381)
  throw new Error(
    '用法：node scripts/smoke-workflow.cjs mongodb://127.0.0.1:27018 6381；Redis 6381 必须为专用临时实例',
  )
process.env.BRAND_FLOW_DEMO_MODE = 'true'
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
apiRequire('reflect-metadata')
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
const { WorkflowService } = apiRequire('./dist/modules/workflow/workflow.service')
const { WorkflowProcessor } = apiRequire('./dist/modules/workflow/workflow.processor')
const { WorkflowSchema } = apiRequire('./dist/modules/workflow/schemas/workflow.schema')
const { WorkflowNodeSchema } = apiRequire('./dist/modules/workflow/schemas/workflow-node.schema')
const { WorkflowRevisionSchema } = apiRequire(
  './dist/modules/workflow/schemas/workflow-revision.schema',
)
const { trackWorkflow, persistWorkflowState, adoptWorkflowNodes } = apiRequire(
  './dist/modules/workflow/workflow-state',
)
const { WORKFLOW_QUEUE } = apiRequire('./dist/modules/workflow/workflow.constants')
Module._resolveFilename = resolve
const agentRequire = createRequire(path.join(root, 'packages/agent/package.json'))
const core = agentRequire('./dist/v1-workflow')
const originalBrief = core.createCreativeBrief
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (await predicate()) return
    await sleep(50)
  }
  throw new Error('等待任务状态超时')
}

async function main() {
  const dbName = `codex_workflow_smoke_${Date.now()}`
  const connection = await mongoose.createConnection(mongoUri, { dbName }).asPromise()
  const redis = { host: '127.0.0.1', port: redisPort }
  const queue = new Queue(WORKFLOW_QUEUE, { connection: redis, prefix: dbName })
  let worker
  let service
  let subscription
  let release
  let ownsQueue = false
  try {
    assert.equal(
      await queue.getJobCountByTypes('waiting', 'active', 'completed', 'failed', 'delayed'),
      0,
    )
    ownsQueue = true
    const Workflow = connection.model('Workflow', WorkflowSchema)
    const Node = connection.model('WorkflowNode', WorkflowNodeSchema)
    const Revision = connection.model('WorkflowRevision', WorkflowRevisionSchema)
    await Promise.all([Workflow.init(), Node.init(), Revision.init()])
    const a = new mongoose.Types.ObjectId().toString()
    const b = new mongoose.Types.ObjectId().toString()
    const createService = (taskQueue) =>
      new WorkflowService(
        Workflow,
        Node,
        Revision,
        taskQueue,
        null,
        null,
        null,
        { countDocuments: async () => 0 },
        {},
      )
    service = createService(queue)
    const legacy = await service.create({ prompt: '升级前的任务', spaceId: 'personal' }, a)
    await Workflow.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(legacy.id) },
      { $set: { status: 'running' }, $unset: { runVersion: 1, eventSequence: 1 } },
    )
    await service.onModuleInit()
    assert.equal((await Workflow.findById(legacy.id)).status, 'failed')
    assert.equal((await Workflow.findById(legacy.id)).runVersion, 1)
    assert.equal((await Node.findOne({ workflowId: legacy.id })).runVersion, 1)
    await Node.deleteMany({ workflowId: legacy.id })
    await Workflow.deleteOne({ _id: legacy.id })
    const first = await service.create({ prompt: '旧版本延迟', spaceId: 'personal' }, a)
    await Promise.all([
      service.start(first.id, { needsComposition: false }, a),
      service.start(first.id, { needsComposition: false }, a),
    ])
    assert.equal(await queue.getJobCountByTypes('waiting', 'active'), 1)
    const job = (await queue.getJobs(['waiting']))[0]
    assert.equal(job.id, `${first.id}-r1-brief`)
    let entered
    const began = new Promise((done) => {
      entered = done
    })
    const gate = new Promise((done) => {
      release = done
    })
    core.createCreativeBrief = async (...args) => {
      entered()
      await gate
      return originalBrief(...args)
    }
    const processor = new WorkflowProcessor(Workflow, Node, Revision, null, {})
    worker = new Worker(WORKFLOW_QUEUE, (queuedJob) => processor.process(queuedJob), {
      connection: redis,
      prefix: dbName,
    })
    await began
    const newer = trackWorkflow(await Workflow.findById(first.id))
    newer.status = 'awaiting_user'
    newer.awaitingAction = 'confirm_brief'
    newer.result = {
      brief: {
        originalRequest: '新版本事实',
        normalizedIntent: '新版本事实',
        outputMode: 'pure_image',
        needsComposition: false,
        constraints: [],
        assumptions: [],
      },
    }
    await persistWorkflowState(Workflow, newer, true)
    await adoptWorkflowNodes(Node, newer)
    release()
    await until(async () => (await job.getState()) === 'completed')
    assert.equal((await Workflow.findById(first.id)).result.brief.originalRequest, '新版本事实')
    assert.equal((await Workflow.findById(first.id)).runVersion, 2)
    core.createCreativeBrief = originalBrief
    await Promise.all([
      service.runNode(first.id, 'brief', a),
      service.runNode(first.id, 'brief', a),
    ])
    await until(async () => (await Workflow.findById(first.id)).status === 'awaiting_user')
    assert.equal((await Workflow.findById(first.id)).runVersion, 3)
    assert.equal(await queue.getJobCountByTypes('waiting', 'active', 'completed', 'failed'), 2)

    const cancelTask = await service.create({ prompt: '取消延迟', spaceId: 'personal' }, a)
    let cancelEntered
    const cancelBegan = new Promise((done) => {
      cancelEntered = done
    })
    const cancelGate = new Promise((done) => {
      release = done
    })
    core.createCreativeBrief = async (...args) => {
      cancelEntered()
      await cancelGate
      return originalBrief(...args)
    }
    await service.start(cancelTask.id, { needsComposition: false }, a)
    await cancelBegan
    await service.cancel(cancelTask.id, a)
    release()
    await until(async () =>
      (await queue.getJob(`${cancelTask.id}-r1-brief`))
        .getState()
        .then((state) => state === 'completed'),
    )
    assert.equal((await Workflow.findById(cancelTask.id)).status, 'cancelled')
    assert.equal((await Workflow.findById(cancelTask.id)).result, undefined)
    await assert.rejects(service.retry(cancelTask.id, a))
    core.createCreativeBrief = originalBrief

    const failure = await service.create({ prompt: '入队失败', spaceId: 'personal' }, a)
    const failedService = createService({
      add: async () => {
        throw new Error('queue unavailable')
      },
    })
    await assert.rejects(
      failedService.start(failure.id, { needsComposition: false }, a),
      /queue unavailable/,
    )
    assert.equal((await Workflow.findById(failure.id)).status, 'failed')
    await service.retry(failure.id, a)
    await until(async () => (await Workflow.findById(failure.id)).status === 'awaiting_user')
    const list = await service.listWorkflows({ spaceId: 'personal', page: 1, limit: 20 }, a)
    assert.equal(list.total, 3)
    assert.equal(
      (await service.listWorkflows({ spaceId: 'personal', page: 1, limit: 20 }, b)).total,
      0,
    )
    await assert.rejects(service.getWorkflowDetail(first.id, b))
    const snapshots = []
    const stream = await service.streamWorkflow(first.id, a)
    subscription = stream.subscribe({
      next: (event) => snapshots.push(event.data),
      error: (error) => {
        throw error
      },
    })
    await until(() => snapshots.some((event) => event.type === 'workflow_snapshot'))
    subscription.unsubscribe()
    subscription = (await service.streamWorkflow(first.id, a)).subscribe({
      next: (event) => snapshots.push(event.data),
    })
    await service.cancel(first.id, a)
    await until(() =>
      snapshots.some(
        (event) =>
          event.type === 'workflow_snapshot' && event.snapshot.workflow.status === 'cancelled',
      ),
    )
    assert.equal((await service.getWorkflowDetail(first.id, a)).workflow.status, 'cancelled')
    console.log(
      'PASS：真实 Mongo/BullMQ 重复启动与重跑幂等、旧任务 fencing、取消后迟到结果、队列失败重试、分页/用户隔离及断线快照恢复',
    )
  } finally {
    release?.()
    core.createCreativeBrief = originalBrief
    subscription?.unsubscribe()
    await worker?.close()
    await service?.onModuleDestroy()
    if (ownsQueue) await queue.obliterate({ force: true })
    await queue.close()
    assert.ok(connection.name.startsWith('codex_workflow_smoke_'))
    await connection.dropDatabase()
    await connection.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
