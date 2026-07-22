import assert from 'node:assert/strict'
import test from 'node:test'

import {
  composeFinalImage,
  createCreativeBriefFallback,
  createDirectionFallbacks,
  createArtTextPlacementPlan,
  ensureThreeDirections,
  generateArtTextCandidates,
  parseCreativeBrief,
} from './v1-workflow'

test('CreativeBrief JSON 失败时返回结构化 fallback', () => {
  const result = parseCreativeBrief('not-json', '生成一张山水图')
  assert.equal(result.outputMode, 'pure_image')
  assert.equal(result.needsComposition, false)
  assert.equal(result.originalRequest, '生成一张山水图')
})

test('演示模式严格生成四个逐字一致且样式不同的艺术字候选', async () => {
  const previous = process.env.BRAND_FLOW_DEMO_MODE
  process.env.BRAND_FLOW_DEMO_MODE = 'true'
  try {
    const candidates = await generateArtTextCandidates(
      { baseCandidateId: 'c1', textContent: '夏日\n清爽', stylePrompt: '冰感高光' },
      { id: 'c1', imageUrl: 'data:image/png;base64,AA==', prompt: '夏日底图' },
    )
    assert.equal(candidates.length, 4)
    assert.equal(
      candidates.every((item) => item.textContent === '夏日\n清爽'),
      true,
    )
    assert.equal(
      candidates.every((item) => item.source === 'demo'),
      true,
    )
    assert.equal(new Set(candidates.map((item) => JSON.stringify(item.vectorSpec))).size, 4)
  } finally {
    if (previous === undefined) delete process.env.BRAND_FLOW_DEMO_MODE
    else process.env.BRAND_FLOW_DEMO_MODE = previous
  }
})

test('区域无法容纳艺术字时拒绝生成放置方案', async () => {
  const previous = process.env.BRAND_FLOW_DEMO_MODE
  process.env.BRAND_FLOW_DEMO_MODE = 'true'
  try {
    const [candidate] = await generateArtTextCandidates(
      {
        baseCandidateId: 'c1',
        textContent: '这是一段无法放入狭窄区域的长艺术字文本',
        stylePrompt: '海报风格',
      },
      { id: 'c1', imageUrl: 'data:image/png;base64,AA==', prompt: '底图' },
    )
    await assert.rejects(
      createArtTextPlacementPlan(candidate, { x: 0.1, y: 0.1, width: 0.08, height: 0.05 }),
      /框选区域太小/,
    )
  } finally {
    if (previous === undefined) delete process.env.BRAND_FLOW_DEMO_MODE
    else process.env.BRAND_FLOW_DEMO_MODE = previous
  }
})

test('放置方案严格保留用户框选区域', async () => {
  const previous = process.env.BRAND_FLOW_DEMO_MODE
  process.env.BRAND_FLOW_DEMO_MODE = 'true'
  try {
    const [candidate] = await generateArtTextCandidates(
      { baseCandidateId: 'c1', textContent: '品牌文字', stylePrompt: '品牌极简' },
      { id: 'c1', imageUrl: 'data:image/png;base64,AA==', prompt: '底图' },
    )
    const region = { x: 0.1, y: 0.15, width: 0.5, height: 0.2 }
    const plan = await createArtTextPlacementPlan(candidate, region)
    assert.deepEqual(plan.region, region)
  } finally {
    if (previous === undefined) delete process.env.BRAND_FLOW_DEMO_MODE
    else process.env.BRAND_FLOW_DEMO_MODE = previous
  }
})

test('创意方向始终返回三个差异方案', () => {
  const brief = createCreativeBriefFallback('制作新品海报')
  const directions = ensureThreeDirections([], brief)
  assert.equal(directions.length, 3)
  assert.equal(new Set(directions.map((item) => item.visualStyle)).size, 3)
  assert.deepEqual(directions, createDirectionFallbacks(brief))
})

test('无需合成时保留原候选图并标记 skipped', () => {
  const brief = createCreativeBriefFallback('生成一张山水图')
  const result = composeFinalImage(
    { id: 'c1', imageUrl: 'https://example.com/a.png', prompt: '山水' },
    brief,
  )
  assert.equal(result.mode, 'skipped')
  assert.equal(result.finalImageUrl, 'https://example.com/a.png')
})
