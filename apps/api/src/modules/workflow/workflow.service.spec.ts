import { Types } from 'mongoose'

import { WorkflowService } from './workflow.service'
import type { WorkflowDocument } from './schemas/workflow.schema'

const createWorkflow = (status: WorkflowDocument['status']): WorkflowDocument =>
  ({
    _id: new Types.ObjectId(),
    status,
    prompt: '测试创作需求',
    spaceId: 'personal',
    spaceType: 'personal',
    userId: new Types.ObjectId().toString(),
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    runVersion: 0,
    eventSequence: 0,
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
  }) as WorkflowDocument

const createService = () => {
  const workflowModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  }
  const workflowQueue = { add: jest.fn() }
  const nodeModel = {
    updateMany: jest.fn().mockResolvedValue({}),
    find: jest.fn(() => ({ sort: jest.fn().mockResolvedValue([]) })),
  }
  const service = new WorkflowService(
    workflowModel as never,
    nodeModel as never,
    {} as never,
    workflowQueue as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { service, workflowModel, workflowQueue }
}

describe('WorkflowService.start', () => {
  it('通用节点更新拒绝客户端质检、评分和服务端状态', async () => {
    const { service, workflowModel } = createService()
    const workflow = createWorkflow('awaiting_user')
    workflowModel.findOne.mockResolvedValue(workflow)
    for (const [type, output] of [
      ['finalEvaluation', { passed: true }],
      ['generate', { selectedCandidateId: 'a', evaluations: [] }],
      ['creativeDirection', { status: 'completed' }],
    ] as const) {
      await expect(
        service.updateNodeOutput(workflow._id.toString(), type, output, workflow.userId),
      ).rejects.toThrow('服务端输出不可编辑')
    }
    expect(workflowModel.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('SSE 只有资源鉴权成功后才注册队列监听', async () => {
    const { service, workflowModel } = createService()
    const workflow = createWorkflow('running')
    const events = { on: jest.fn(), off: jest.fn() }
    Reflect.set(service, 'queueEvents', events)
    workflowModel.findOne.mockResolvedValue(workflow)
    await expect(
      service.streamWorkflow(workflow._id.toString(), new Types.ObjectId().toString()),
    ).rejects.toThrow('资源不存在或无权访问')
    expect(events.on).not.toHaveBeenCalled()
    const observable = await service.streamWorkflow(workflow._id.toString(), workflow.userId)
    const next = jest.fn()
    const subscription = observable.subscribe(next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(events.on).toHaveBeenCalledTimes(3)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'workflow_snapshot' }) }),
    )
    subscription.unsubscribe()
    expect(events.off).toHaveBeenCalledTimes(3)
  })
  it('A 不能访问或启动 B 的个人工作流', async () => {
    const { service, workflowModel, workflowQueue } = createService()
    const workflow = createWorkflow('pending')
    workflowModel.findOne.mockResolvedValue(workflow)
    await expect(
      service.start(
        workflow._id.toString(),
        { needsComposition: false },
        new Types.ObjectId().toString(),
      ),
    ).rejects.toThrow('资源不存在或无权访问')
    expect(workflowQueue.add).not.toHaveBeenCalled()
  })
  it('只允许一个请求把 pending 工作流认领为 running', async () => {
    const { service, workflowModel, workflowQueue } = createService()
    const pending = createWorkflow('pending')
    const running = {
      ...pending,
      status: 'running',
      needsComposition: true,
      runVersion: 1,
      eventSequence: 1,
    } as WorkflowDocument
    workflowModel.findOne.mockResolvedValue(pending)
    workflowModel.findOneAndUpdate.mockResolvedValue(running)
    workflowQueue.add.mockResolvedValue({})

    const result = await service.start(
      pending._id.toString(),
      { needsComposition: true },
      pending.userId,
    )

    expect(result.status).toBe('running')
    expect(workflowModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: pending._id,
        status: 'pending',
        runVersion: { $in: [0, null] },
        eventSequence: { $in: [0, null] },
      },
      expect.objectContaining({ $set: expect.objectContaining({ needsComposition: true }) }),
      { new: true },
    )
    expect(workflowQueue.add).toHaveBeenCalledTimes(1)
  })

  it('队列写入失败时进入可恢复 failed 并记录错误', async () => {
    const { service, workflowModel, workflowQueue } = createService()
    const pending = createWorkflow('pending')
    const running = {
      ...pending,
      status: 'running',
      needsComposition: false,
      runVersion: 1,
      eventSequence: 1,
    } as WorkflowDocument
    workflowModel.findOne.mockResolvedValue(pending)
    workflowModel.findOneAndUpdate.mockResolvedValue(running)
    workflowModel.updateOne.mockResolvedValue({ acknowledged: true })
    workflowQueue.add.mockRejectedValue(new Error('redis unavailable'))

    await expect(
      service.start(pending._id.toString(), { needsComposition: false }, pending.userId),
    ).rejects.toThrow('redis unavailable')
    expect(workflowModel.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: pending._id, status: 'running', runVersion: 1, eventSequence: 1 },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed', errorMessage: '任务入队失败，请重试' }),
      }),
      { new: true },
    )
  })

  it('非 pending 工作流重复启动时不重复入队', async () => {
    const { service, workflowModel, workflowQueue } = createService()
    const running = createWorkflow('running')
    workflowModel.findOne.mockResolvedValue(running)

    const result = await service.start(
      running._id.toString(),
      { needsComposition: true },
      running.userId,
    )

    expect(result.status).toBe('running')
    expect(workflowModel.findOneAndUpdate).not.toHaveBeenCalled()
    expect(workflowQueue.add).not.toHaveBeenCalled()
  })
})
