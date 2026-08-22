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
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
  }) as WorkflowDocument

const createService = () => {
  const workflowModel = {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  }
  const workflowQueue = { add: jest.fn() }
  const service = new WorkflowService(
    workflowModel as never,
    {} as never,
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
  it('只允许一个请求把 pending 工作流认领为 running', async () => {
    const { service, workflowModel, workflowQueue } = createService()
    const pending = createWorkflow('pending')
    const running = { ...pending, status: 'running', needsComposition: true } as WorkflowDocument
    workflowModel.findById.mockResolvedValue(pending)
    workflowModel.findOneAndUpdate.mockResolvedValue(running)
    workflowQueue.add.mockResolvedValue({})

    const result = await service.start(
      pending._id.toString(),
      { needsComposition: true },
      pending.userId,
    )

    expect(result.status).toBe('running')
    expect(workflowModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: pending._id, status: 'pending' },
      expect.objectContaining({ $set: expect.objectContaining({ needsComposition: true }) }),
      { new: true },
    )
    expect(workflowQueue.add).toHaveBeenCalledTimes(1)
  })

  it('队列写入失败时把工作流恢复为 pending', async () => {
    const { service, workflowModel, workflowQueue } = createService()
    const pending = createWorkflow('pending')
    const running = { ...pending, status: 'running', needsComposition: false } as WorkflowDocument
    workflowModel.findById.mockResolvedValue(pending)
    workflowModel.findOneAndUpdate.mockResolvedValue(running)
    workflowModel.updateOne.mockResolvedValue({ acknowledged: true })
    workflowQueue.add.mockRejectedValue(new Error('redis unavailable'))

    await expect(
      service.start(pending._id.toString(), { needsComposition: false }, pending.userId),
    ).rejects.toThrow('redis unavailable')
    expect(workflowModel.updateOne).toHaveBeenCalledWith(
      { _id: pending._id, status: 'running' },
      { $set: { status: 'pending' }, $unset: { needsComposition: 1 } },
    )
  })

  it('非 pending 工作流重复启动时不重复入队', async () => {
    const { service, workflowModel, workflowQueue } = createService()
    const running = createWorkflow('running')
    workflowModel.findById.mockResolvedValue(running)

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
