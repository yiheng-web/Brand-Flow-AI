import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createInitialWorkflowNodes,
  downstreamNodeTypes,
  isNormalizedArtTextRegion,
  parseWorkflowSseEvent,
  normalizeCreativeDirection,
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
    { ...base, candidateId: 'b', totalScore: 7 },
    { ...base, candidateId: 'a', totalScore: 9 },
  ])
  assert.equal(sorted[0].candidateId, 'a')
})

test('艺术字区域必须使用画布内的归一化坐标', () => {
  assert.equal(isNormalizedArtTextRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.3 }), true)
  assert.equal(isNormalizedArtTextRegion({ x: 0.8, y: 0.2, width: 0.3, height: 0.3 }), false)
})

test('SSE 解析支持等待用户的可恢复状态', () => {
  const event = parseWorkflowSseEvent({
    type: 'workflow_awaiting_user',
    workflowId: 'wf-1',
    action: 'enter_art_text',
    timestamp: new Date().toISOString(),
  })
  assert.equal(event?.type, 'workflow_awaiting_user')
})

test('旧创意方向可以归一化为增强契约', () => {
  const direction = normalizeCreativeDirection({
    id: 'legacy',
    title: '高端路线',
    summary: '强调材质与光影',
    visualStyle: '商业摄影',
    channels: ['品牌官网'],
  })
  assert.equal(direction.name, '高端路线')
  assert.deepEqual(direction.applicableScenes, ['品牌官网'])
  assert.ok(direction.reason)
  assert.ok(direction.risk)
})
