import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { createRequire } from 'node:module'

import {
  composeFinalImage,
  createCreativeBriefFallback,
  createDirectionFallbacks,
  createArtTextPlacementPlan,
  ensureThreeDirections,
  generateArtTextCandidates,
  normalizePlacementContrastStrength,
  revisePromptPlan,
  parseCreativeBrief,
  validateArtTextVectorSpec,
  evaluateFinalImage,
  generateCandidates,
  createCreativeBrief,
  createPromptPlan,
} from './v1-workflow'
import { safeJsonParse } from './common'
import { buildCandidateEvaluationPrompt } from './ai-logic/evaluate/candidate-evaluate.chain'
import { extractReferenceConstraints } from './reference'

test('视觉模型实际收到图片且返回结构化特征，异常输出不伪造成功', async () => {
  const chat = createRequire(__filename)(
    './common/siliconflow-chat',
  ) as typeof import('./common/siliconflow-chat')
  const previous = process.env.BRAND_FLOW_DEMO_MODE
  process.env.BRAND_FLOW_DEMO_MODE = 'false'
  let valid = true
  const model = mock.method(
    chat,
    'createSiliconFlowChatModel',
    () =>
      ({
        invoke: async (messages: unknown) => {
          assert.match(JSON.stringify(messages), /data:image\/png;base64/)
          return {
            content: JSON.stringify(
              valid
                ? {
                    description: '蓝色玻璃瓶',
                    colors: ['蓝色'],
                    shape: '圆柱',
                    material: '玻璃',
                    composition: '居中',
                  }
                : { description: '瓶子', colors: [42] },
            ),
          }
        },
      }) as unknown as ReturnType<typeof chat.createSiliconFlowChatModel>,
  )
  try {
    const reference = {
      assetId: 'asset-b',
      name: '产品',
      role: 'product' as const,
      objectKey: 'server-key',
      mimeType: 'image/png',
      imageUrl: 'data:image/png;base64,test',
      strategy: 'visual_constraints' as const,
    }
    assert.equal(
      (await extractReferenceConstraints(reference)).visualConstraints?.description,
      '蓝色玻璃瓶',
    )
    valid = false
    await assert.rejects(extractReferenceConstraints(reference), /解析失败/)
  } finally {
    model.mock.restore()
    if (previous === undefined) delete process.env.BRAND_FLOW_DEMO_MODE
    else process.env.BRAND_FLOW_DEMO_MODE = previous
  }
})

test('参考上下文进入 Brief 和 Prompt，Demo 四候选实际尺寸、种子与元数据一致', async () => {
  const previous = process.env.BRAND_FLOW_DEMO_MODE
  process.env.BRAND_FLOW_DEMO_MODE = 'true'
  try {
    const reference = await extractReferenceConstraints({
      assetId: 'asset-a',
      name: '咖啡产品',
      role: 'product',
      objectKey: 'server-key',
      mimeType: 'image/png',
      imageUrl: 'server-image',
      strategy: 'visual_constraints',
    })
    assert.equal(reference.visualConstraints?.source, 'demo')
    const brief = await createCreativeBrief('咖啡产品纯图片', undefined, [reference])
    assert.ok(brief.constraints.some((constraint) => constraint.includes('asset-a')))
    const plan = await createPromptPlan(
      { ...brief, constraints: [] },
      createDirectionFallbacks(brief)[0],
      { required: [], recommended: [], optional: [], sources: [] },
      [reference],
    )
    assert.match(plan.imagePrompt, /咖啡产品.*asset-a/)
    plan.generationConfig = { aspectRatio: '16:9', seed: 42 }
    const candidates = await generateCandidates(plan)
    assert.equal(candidates.length, 4)
    assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, 4)
    assert.deepEqual(
      candidates.map((candidate) => candidate.seed),
      [42, 43, 44, 45],
    )
    const png = Buffer.from(candidates[0].imageUrl.split(',')[1], 'base64')
    assert.equal(png.readUInt32BE(16), 1280)
    assert.equal(png.readUInt32BE(20), 720)
    assert.equal(
      (candidates[0].metadata?.generationConfig as { imageSize: string }).imageSize,
      '1280x720',
    )
  } finally {
    if (previous === undefined) delete process.env.BRAND_FLOW_DEMO_MODE
    else process.env.BRAND_FLOW_DEMO_MODE = previous
  }
})

test('超长强制规则逐批质检，后续批次失败不能被前面通过覆盖', async () => {
  const evaluateModule = createRequire(__filename)(
    './ai-logic/evaluate/final-evaluate.chain',
  ) as typeof import('./ai-logic/evaluate/final-evaluate.chain')
  const seen: string[] = []
  const previous = process.env.BRAND_FLOW_DEMO_MODE
  process.env.BRAND_FLOW_DEMO_MODE = 'false'
  const evaluator = mock.method(
    evaluateModule,
    'runFinalEvaluation',
    async (_url: string, input: string) => {
      const payload = JSON.parse(input) as { constraints: { required: Array<{ id: string }> } }
      seen.push(...payload.constraints.required.map((rule) => rule.id))
      const failed = payload.constraints.required.some((rule) => rule.id === '39')
      return {
        overallScore: failed ? 60 : 90,
        passed: !failed,
        dimensionScores: {
          brandCompliance: failed ? 60 : 90,
          technicalQuality: 90,
          compositionQuality: 90,
          aestheticQuality: 90,
        },
        deductions: failed ? [{ dimension: 'brand', deduction: 30, reason: '第40条不满足' }] : [],
        suggestions: failed ? ['修复第40条'] : [],
      }
    },
  )
  try {
    const required = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      title: `规则${index}`,
      description: '完整语义'.repeat(100),
    }))
    const result = await evaluateFinalImage(
      'https://example.invalid/image.png',
      { required, recommended: [], optional: [], sources: [] },
      createCreativeBriefFallback('风景'),
    )
    assert.deepEqual(
      seen,
      required.map((rule) => rule.id),
    )
    assert.ok(evaluator.mock.callCount() > 1)
    assert.equal(result.passed, false)
    assert.equal(result.totalScore, 6)
    assert.ok(result.suggestions.includes('修复第40条'))
  } finally {
    evaluator.mock.restore()
    if (previous === undefined) delete process.env.BRAND_FLOW_DEMO_MODE
    else process.env.BRAND_FLOW_DEMO_MODE = previous
  }
})

test('结构化解析兼容 JSON 前后的模型说明文字', () => {
  assert.deepEqual(safeJsonParse('分析完成。\n```json\n{"directions":[1,2,3]}\n```\n以上。'), {
    directions: [1, 2, 3],
  })
})

test('候选质检提示包含四个真实候选 ID', () => {
  const candidates = [1, 2, 3, 4].map((index) => ({
    id: `candidate-${index}`,
    url: `https://example.com/${index}.png`,
    index,
    promptUsed: '测试',
  }))
  const prompt = buildCandidateEvaluationPrompt(candidates, '{}')
  for (const candidate of candidates) assert.match(prompt, new RegExp(candidate.id))
  assert.doesNotMatch(prompt, /\{candidate[1-4]Id\}/)
})

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

test('放置方案兼容模型返回的十分制对比增强强度', () => {
  assert.equal(normalizePlacementContrastStrength(8), 0.8)
  assert.equal(normalizePlacementContrastStrength(0.65), 0.65)
  assert.equal(normalizePlacementContrastStrength(11), 11)
})

test('艺术字渐变拒绝 colors 数组等非契约参数', () => {
  assert.throws(
    () =>
      validateArtTextVectorSpec({
        fontFamily: 'Noto Sans SC',
        fontWeight: 700,
        textAlign: 'center',
        fill: '#FFFFFF',
        gradient: {
          type: 'linear',
          colors: ['#FFFFFF', '#000000'],
          angle: 90,
        },
      } as never),
    /渐变参数不符合受控契约/,
  )
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

test('演示模式反馈优化保留旧 Prompt 并附加修改要求', async () => {
  const previous = process.env.BRAND_FLOW_DEMO_MODE
  process.env.BRAND_FLOW_DEMO_MODE = 'true'
  try {
    const brief = createCreativeBriefFallback('生成科技咖啡海报')
    const [direction] = createDirectionFallbacks(brief)
    const revised = await revisePromptPlan(
      brief,
      direction,
      { required: [], recommended: [], optional: [], sources: [] },
      {
        selectedDirectionId: direction.id,
        imagePrompt: '咖啡产品主视觉',
        generationConfig: { aspectRatio: '1:1' },
      },
      {
        categories: ['color'],
        instruction: '背景改成夜景，增加科技感',
        sourceCandidateId: 'c1',
        preserveBrandPositioning: true,
        preserveCoreSubject: true,
      },
    )
    assert.match(revised.imagePrompt, /背景改成夜景/)
    assert.match(revised.imagePrompt, /保持品牌定位与核心主体不变/)
  } finally {
    if (previous === undefined) delete process.env.BRAND_FLOW_DEMO_MODE
    else process.env.BRAND_FLOW_DEMO_MODE = previous
  }
})
