import type { WorkflowSseEvent } from '@brand-flow/contracts'

const WORKFLOW_ID = 'benchmark-workflow-001'
const TIMESTAMP = '2026-08-24T00:00:00.000Z'

export function createNodeEvent(
  sequence: number,
  type: 'node_started' | 'node_completed' = 'node_completed',
): WorkflowSseEvent {
  if (type === 'node_started') {
    return {
      type,
      workflowId: WORKFLOW_ID,
      nodeId: `node-${sequence}`,
      nodeType: 'generate',
      timestamp: TIMESTAMP,
    }
  }

  return {
    type,
    workflowId: WORKFLOW_ID,
    nodeId: `node-${sequence}`,
    nodeType: 'generate',
    output: {
      sequence,
      content: `第 ${sequence} 个候选图已生成`,
    },
    timestamp: TIMESTAMP,
  }
}

export function createCompletedEvent(sequence = 0): WorkflowSseEvent {
  return {
    type: 'workflow_completed',
    workflowId: WORKFLOW_ID,
    result: { sequence, message: '本地 Mock 工作流完成' },
    timestamp: TIMESTAMP,
  }
}

export function encodeSse(event: WorkflowSseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

export function createContractDataset(size: number): unknown[] {
  return Array.from({ length: size }, (_, index) => {
    if (index % 5 === 0) return createNodeEvent(index, 'node_started')
    if (index % 5 === 1) return createNodeEvent(index)
    if (index % 5 === 2) return createCompletedEvent(index)
    if (index % 5 === 3) {
      return {
        type: 'UNKNOWN_EVENT',
        workflowId: WORKFLOW_ID,
        nodeId: `node-${index}`,
        nodeType: 'generate',
        timestamp: TIMESTAMP,
      }
    }
    return { type: 'node_completed', workflowId: WORKFLOW_ID }
  })
}

export const expectedAcceptedContractEvents = (size: number): number =>
  Array.from({ length: size }, (_, index) => index).filter((index) => index % 5 <= 2).length
