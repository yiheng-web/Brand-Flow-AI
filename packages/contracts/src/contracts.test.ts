import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createInitialWorkflowNodes,
  downstreamNodeTypes,
  parseWorkflowSseEvent,
  sortCandidateEvaluations,
} from './index'

test('初始化严格生成七个 V1 节点', () => {
  const nodes = createInitialWorkflowNodes()
  assert.equal(nodes.length, 7)
  assert.deepEqual(
    nodes.map((node) => node.type),
    [
      'brief',
      'brandConstraint',
      'creativeDirection',
      'prompt',
      'generate',
      'compose',
      'finalEvaluation',
    ],
  )
})

test('重跑节点时只返回下游 stale 节点', () => {
  assert.deepEqual(downstreamNodeTypes('prompt'), ['generate', 'compose', 'finalEvaluation'])
})

test('SSE 解析保留 skipped 语义并兼容旧节点名', () => {
  const event = parseWorkflowSseEvent({
    type: 'node_skipped',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    nodeType: 'composeNode',
    reason: '无需合成',
    timestamp: new Date().toISOString(),
  })
  assert.equal(event?.type, 'node_skipped')
  assert.equal(event && 'nodeType' in event ? event.nodeType : undefined, 'compose')
})

test('候选评分按总分稳定降序排序', () => {
  const base = {
    scores: { brandConsistency: 8, promptAlignment: 8, composition: 8, visualQuality: 8 },
    strengths: [],
    issues: [],
    recommended: false,
    recommendationReason: '',
  }
  const sorted = sortCandidateEvaluations([
    { ...base, candidateId: 'b', totalScore: 70 },
    { ...base, candidateId: 'a', totalScore: 90 },
  ])
  assert.equal(sorted[0].candidateId, 'a')
})
