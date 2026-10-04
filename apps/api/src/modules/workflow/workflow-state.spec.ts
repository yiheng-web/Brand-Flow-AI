import { Types } from 'mongoose'
import type { Model } from 'mongoose'
import { persistWorkflowState, trackWorkflow, StaleWorkflowError } from './workflow-state'
import type { WorkflowDocument } from './schemas/workflow.schema'
import { WorkflowProcessor } from './workflow.processor'

describe('工作流状态转换与旧任务隔离', () => {
  it('旧版本 CAS 被拒绝，不重试无条件覆盖', async () => {
    const model = { findOneAndUpdate: jest.fn().mockResolvedValue(null) }
    const workflow = trackWorkflow({
      _id: new Types.ObjectId(),
      status: 'running',
      runVersion: 3,
      eventSequence: 5,
    } as WorkflowDocument)
    workflow.status = 'completed'
    await expect(
      persistWorkflowState(model as unknown as Model<WorkflowDocument>, workflow),
    ).rejects.toBeInstanceOf(StaleWorkflowError)
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: workflow._id, status: 'running', runVersion: 3, eventSequence: 5 },
      expect.anything(),
      { new: true },
    )
  })

  it('取消后不能恢复 completed，也不执行 Mongo 更新', async () => {
    const model = { findOneAndUpdate: jest.fn() }
    const workflow = trackWorkflow({
      _id: new Types.ObjectId(),
      status: 'cancelled',
      runVersion: 4,
      eventSequence: 8,
    } as WorkflowDocument)
    workflow.status = 'completed'
    await expect(
      persistWorkflowState(model as unknown as Model<WorkflowDocument>, workflow),
    ).rejects.toBeInstanceOf(StaleWorkflowError)
    expect(model.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('Worker 遇到旧版本或已取消任务时不读取节点或调用 Provider', async () => {
    const model = { findById: jest.fn().mockResolvedValue({ status: 'running', runVersion: 4 }) }
    const nodes = { find: jest.fn() }
    const processor = new WorkflowProcessor(
      model as never,
      nodes as never,
      {} as never,
      {} as never,
      {} as never,
    )
    await processor.process({
      name: 'run-workflow',
      data: { workflowId: 'id', runVersion: 3 },
    } as never)
    expect(nodes.find).not.toHaveBeenCalled()
  })
})
