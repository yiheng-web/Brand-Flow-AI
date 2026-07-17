import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkflowSseEvent } from '@brand-flow/contracts'

test('Web SSE 解析保留 stale/skipped 所需的节点身份', () => {
  const event = parseWorkflowSseEvent({
    type: 'node_completed',
    workflowId: 'wf',
    nodeId: 'node',
    nodeType: 'generate',
    output: { candidates: [] },
    timestamp: new Date().toISOString(),
  })
  assert.equal(event?.type, 'node_completed')
  assert.equal(event && 'nodeType' in event ? event.nodeType : undefined, 'generate')
})
