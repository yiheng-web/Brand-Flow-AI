import { ConflictException } from '@nestjs/common'
import { canTransitionNode, canTransitionWorkflow, NODE_TRANSITIONS } from '@brand-flow/contracts'
import type { WorkflowStatus, WorkflowNodeStatus } from '@brand-flow/contracts'
import type { Model } from 'mongoose'
import type { WorkflowDocument } from './schemas/workflow.schema'
import type { WorkflowNodeDocument } from './schemas/workflow-node.schema'

export class StaleWorkflowError extends ConflictException {
  constructor() {
    super('工作流版本或状态已改变，请刷新后重试')
  }
}
const tracked = new WeakMap<
  WorkflowDocument,
  { status: WorkflowStatus; version: number; sequence: number }
>()
export function trackWorkflow(workflow: WorkflowDocument): WorkflowDocument {
  tracked.set(workflow, {
    status: workflow.status,
    version: workflow.runVersion ?? 0,
    sequence: workflow.eventSequence ?? 0,
  })
  return workflow
}
export const versionFilter = (version: number) => (version === 0 ? { $in: [0, null] } : version)

// 状态、版本和序号共同参与 Mongo CAS；旧任务以及取消前的写入都不能覆盖新快照。
export async function persistWorkflowState(
  model: Model<WorkflowDocument>,
  workflow: WorkflowDocument,
  advanceRun = false,
): Promise<void> {
  const expected = tracked.get(workflow)
  if (
    !expected ||
    !canTransitionWorkflow(expected.status, workflow.status) ||
    (expected.status === 'cancelled' && advanceRun)
  )
    throw new StaleWorkflowError()
  const fields = [
    'status',
    'result',
    'awaitingAction',
    'errorMessage',
    'needsComposition',
    'currentNode',
    'progress',
  ] as const
  const $set: Record<string, unknown> = {}
  const $unset: Record<string, 1> = {}
  for (const field of fields) {
    if (workflow[field] === undefined) $unset[field] = 1
    else $set[field] = workflow[field]
  }
  const updated = await model.findOneAndUpdate(
    {
      _id: workflow._id,
      status: expected.status,
      runVersion: versionFilter(expected.version),
      eventSequence: versionFilter(expected.sequence),
    },
    { $set, $unset, $inc: { eventSequence: 1, ...(advanceRun ? { runVersion: 1 } : {}) } },
    { new: true },
  )
  if (!updated) throw new StaleWorkflowError()
  workflow.runVersion = updated.runVersion
  workflow.eventSequence = updated.eventSequence
  workflow.updatedAt = updated.updatedAt
  trackWorkflow(workflow)
}
export async function adoptWorkflowNodes(
  model: Model<WorkflowNodeDocument>,
  workflow: WorkflowDocument,
): Promise<void> {
  await model.updateMany(
    {
      workflowId: workflow._id.toString(),
      $or: [{ runVersion: { $lt: workflow.runVersion } }, { runVersion: { $exists: false } }],
    },
    { $set: { runVersion: workflow.runVersion } },
  )
}
export async function persistNodeState(
  nodeModel: Model<WorkflowNodeDocument>,
  workflowModel: Model<WorkflowDocument>,
  workflow: WorkflowDocument,
  nodeId: unknown,
  patch: Record<string, unknown>,
): Promise<WorkflowNodeDocument> {
  const status = patch.status as WorkflowNodeStatus | undefined
  if (workflow.status === 'cancelled' && status !== 'stale') throw new StaleWorkflowError()
  const from = Object.keys(NODE_TRANSITIONS).filter(
    (value) => !status || canTransitionNode(value as WorkflowNodeStatus, status),
  )
  const node = await nodeModel.findOneAndUpdate(
    {
      _id: nodeId,
      workflowId: workflow._id.toString(),
      runVersion: versionFilter(workflow.runVersion ?? 0),
      status: { $in: from },
    },
    patch,
    { new: true },
  )
  if (!node) throw new StaleWorkflowError()
  await persistWorkflowState(workflowModel, workflow)
  return node
}
