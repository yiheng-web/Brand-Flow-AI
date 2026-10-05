import assert from 'node:assert/strict'
import test from 'node:test'

import {
  Role,
  spacePermissions,
  createInitialWorkflowNodes,
  downstreamNodeTypes,
  isNormalizedArtTextRegion,
  parseWorkflowSseEvent,
  normalizeCreativeDirection,
  sortCandidateEvaluations,
  parseKnowledgeImport,
  splitBrandConstraintPackage,
  mergeKnowledgeRules,
  canTransitionNode,
  canTransitionWorkflow,
} from './index'

test('组织规则拒绝明确冲突，保留强制/禁用项，按来源合并参考并提示自然语言', () => {
  const rule = (
    id: string,
    description: string,
    sourceSpaceType: 'enterprise' | 'team' | 'personal',
    level: 'required' | 'recommended' = 'required',
  ) => ({
    id,
    title: id,
    description,
    sourceSpaceType,
    sourceSpaceId: sourceSpaceType,
    level,
    sourceKnowledgeBaseId: `kb-${id}`,
    sourceItemId: id,
  })
  for (const [parent, child] of [
    ['品牌色: #00A862', '品牌色: #000000'],
    ['Logo禁用: 拉伸', 'Logo使用: 拉伸'],
    ['禁用文案: 最低价', '必用文案: 最低价'],
  ]) {
    const result = mergeKnowledgeRules([
      rule('企业规则', parent, 'enterprise'),
      rule('团队规则', child, 'team', 'recommended'),
    ])
    assert.equal(result.conflicts.length, 1)
    assert.match(result.conflicts[0], /企业强制规则/)
  }
  const result = mergeKnowledgeRules([
    ...Array.from({ length: 35 }, (_, i) => rule(`强制${i}`, `规则${i}`, 'enterprise')),
    rule('企业参考', '品牌色: #111111', 'enterprise', 'recommended'),
    rule('团队参考', '品牌色: #222222', 'team', 'recommended'),
    rule('个人参考', '品牌色: #333333', 'personal', 'recommended'),
    rule('禁用项', 'Logo禁用: 拉伸', 'team', 'recommended'),
    rule('自然语言', '视觉要更年轻', 'team', 'recommended'),
  ])
  assert.equal(result.constraints.required.length, 36)
  assert.deepEqual(
    result.constraints.recommended.map((entry) => entry.id),
    ['自然语言', '个人参考'],
  )
  assert.ok(result.warnings.some((warning) => warning.includes('自然语言')))
  assert.ok(result.constraints.sources.some((source) => source.spaceType === 'personal'))
  const batches = splitBrandConstraintPackage(result.constraints, 3000)
  assert.equal(
    batches.reduce((count, batch) => count + batch.required.length, 0),
    36,
  )
  assert.ok(batches.every((batch) => batch.sources.every((source) => source.spaceType)))
  assert.equal(
    mergeKnowledgeRules([rule('内部冲突', '必用文案: 最低价；禁用文案: 最低价', 'enterprise')])
      .conflicts.length,
    1,
  )
  // 不同团队的强制规则彼此隔离。
  assert.equal(
    mergeKnowledgeRules([
      { ...rule('甲', '品牌色: #111111', 'team'), sourceSpaceId: '甲团队' },
      { ...rule('乙', '品牌色: #222222', 'team'), sourceSpaceId: '乙团队' },
    ]).conflicts.length,
    0,
  )
})

test('工作流和节点转换受控，取消是终态，失败允许重试', () => {
  assert.equal(canTransitionWorkflow('pending', 'running'), true)
  assert.equal(canTransitionWorkflow('running', 'pending'), false)
  assert.equal(canTransitionWorkflow('cancelled', 'completed'), false)
  assert.equal(canTransitionWorkflow('failed', 'running'), true)
  assert.equal(canTransitionNode('pending', 'completed'), true)
  assert.equal(canTransitionNode('failed', 'pending'), true)
  assert.equal(canTransitionNode('stale', 'skipped'), false)
})

test('文本导入保留规则正文、解析级别并拒绝空规则和超量输入', () => {
  assert.deepEqual(
    parseKnowledgeImport('[required] 品牌必须为蓝色\n\n参考照片\n[optional] 可用渐变'),
    [
      { title: '品牌必须为蓝色', content: '品牌必须为蓝色', constraintLevel: 'required' },
      { title: '参考照片', content: '参考照片', constraintLevel: 'recommended' },
      { title: '可用渐变', content: '可用渐变', constraintLevel: 'optional' },
    ],
  )
  assert.throws(() => parseKnowledgeImport('[required]'), /1~5000/)
  assert.throws(() => parseKnowledgeImport(Array(201).fill('规则').join('\n')), /200/)
  assert.throws(() => parseKnowledgeImport('x'.repeat(5001)), /5000/)
})

test('超长约束分批保留全部强制规则和条目来源，包括第 31 条', () => {
  const required = Array.from({ length: 40 }, (_, index) => ({
    id: String(index),
    title: `规则${index}`,
    description: '完整正文'.repeat(100),
    sourceKnowledgeBaseId: 'kb',
    sourceItemId: String(index),
  }))
  const batches = splitBrandConstraintPackage({
    required,
    recommended: [],
    optional: [],
    sources: [],
  })
  assert.ok(batches.length > 1)
  assert.deepEqual(
    batches.flatMap((batch) => batch.required),
    required,
  )
  assert.equal(batches.flatMap((batch) => batch.sources).length, 40)
  assert.ok(batches.every((batch) => JSON.stringify(batch).length <= 12000))
  assert.throws(
    () =>
      splitBrandConstraintPackage({
        required: [{ id: 'huge', title: '过长', description: 'x'.repeat(13000) }],
        recommended: [],
        optional: [],
        sources: [],
      }),
    /过长/,
  )
})

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

test('SSE 解析拒绝未知事件和缺少必填字段的事件', () => {
  const timestamp = new Date().toISOString()
  assert.equal(
    parseWorkflowSseEvent({
      type: 'UNKNOWN_EVENT',
      workflowId: 'wf-1',
      nodeId: 'node-1',
      nodeType: 'generate',
      timestamp,
    }),
    null,
  )
  assert.equal(
    parseWorkflowSseEvent({
      type: 'node_completed',
      workflowId: 'wf-1',
      nodeId: 'node-1',
      nodeType: 'generate',
      timestamp,
    }),
    null,
  )
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

test('空间权限契约区分只读、创作与管理权限', () => {
  assert.equal(spacePermissions('enterprise', Role.VIEWER).write, false)
  assert.equal(spacePermissions('team', Role.MEMBER).manageAssets, false)
  assert.equal(spacePermissions('team', Role.MEMBER).manageWorks, true)
  assert.equal(spacePermissions('enterprise', Role.ADMIN).manageMembers, true)
  assert.equal(spacePermissions('personal', Role.OWNER).assignTasks, false)
  assert.equal(spacePermissions('personal', Role.OWNER).manageOrganization, false)
  assert.equal(spacePermissions('enterprise', Role.OWNER).transferOwnership, true)
  assert.equal(spacePermissions('enterprise', Role.ADMIN).transferOwnership, false)
})
