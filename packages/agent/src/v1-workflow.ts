import { HumanMessage } from '@langchain/core/messages'
import { deflateSync } from 'node:zlib'
import type {
  BrandConstraintPackage,
  ArtTextCandidate,
  ArtTextGenerationInput,
  ArtTextPlacementPlan,
  ArtTextRegion,
  ArtTextVectorSpec,
  CandidateEvaluation,
  CandidateImage,
  CreativeBrief,
  CreativeDirection,
  CompositionOutput,
  FinalEvaluationResult,
  PromptPlan,
} from '@brand-flow/contracts'

import { safeJsonParse } from './common'
import { evaluateCandidates, runFinalEvaluation } from './ai-logic/evaluate'
import { generateService } from './generate'
import { createOpenAIChatModel, extractOpenAIText, getOpenAISettings } from './common/openai-config'

export function isDemoMode(): boolean {
  return process.env.BRAND_FLOW_DEMO_MODE === 'true'
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function hasCompositionIntent(prompt: string): boolean {
  return /海报|广告|封面|宣传|电商|标题|副标题|文案|logo|slogan|cta|加字|写着/i.test(prompt)
}

export function createCreativeBriefFallback(originalRequest: string): CreativeBrief {
  const needsComposition = hasCompositionIntent(originalRequest)
  const headlineMatch = originalRequest.match(/(?:标题|文案)(?:是|写|写着|为)?[“"']([^”"']+)[”"']/)
  return {
    originalRequest,
    normalizedIntent: originalRequest.trim() || '生成品牌视觉内容',
    outputMode: needsComposition ? 'graphic_design' : 'pure_image',
    needsComposition,
    textIntent: headlineMatch?.[1] ? { headline: headlineMatch[1] } : undefined,
    constraints: [],
    assumptions: ['模型结构化输出不可用，已根据原始需求生成可继续执行的保守 Brief'],
  }
}

export function parseCreativeBrief(raw: string, originalRequest: string): CreativeBrief {
  const fallback = createCreativeBriefFallback(originalRequest)
  const parsed = safeJsonParse<Partial<CreativeBrief>>(raw, fallback) ?? fallback
  const outputMode = ['pure_image', 'graphic_design', 'scene_text', 'both'].includes(
    parsed.outputMode ?? '',
  )
    ? (parsed.outputMode as CreativeBrief['outputMode'])
    : fallback.outputMode

  return {
    originalRequest,
    normalizedIntent: parsed.normalizedIntent?.trim() || fallback.normalizedIntent,
    targetAudience: parsed.targetAudience,
    channel: parsed.channel,
    outputMode,
    needsComposition:
      typeof parsed.needsComposition === 'boolean'
        ? parsed.needsComposition
        : outputMode === 'graphic_design' || outputMode === 'both',
    textIntent:
      parsed.textIntent && typeof parsed.textIntent === 'object'
        ? parsed.textIntent
        : fallback.textIntent,
    constraints: normalizeStringArray(parsed.constraints),
    assumptions: normalizeStringArray(parsed.assumptions),
  }
}

async function invokeJson<T>(instruction: string, payload: unknown): Promise<T | null> {
  const llm = createOpenAIChatModel()
  const response = await llm.invoke([
    new HumanMessage(`${instruction}\n\n输入：\n${JSON.stringify(payload)}\n\n只输出 JSON。`),
  ])
  const raw = extractOpenAIText(response.content)
  return safeJsonParse<T>(raw)
}

async function invokeImageJson<T>(
  instruction: string,
  payload: unknown,
  imageUrl: string,
): Promise<T | null> {
  const llm = createOpenAIChatModel()
  const response = await llm.invoke([
    new HumanMessage({
      content: [
        {
          type: 'text',
          text: `${instruction}\n\n输入：\n${JSON.stringify(payload)}\n\n只输出 JSON。`,
        },
        { type: 'image_url' as const, image_url: { url: imageUrl } },
      ],
    }),
  ])
  const raw = extractOpenAIText(response.content)
  return safeJsonParse<T>(raw)
}

export async function createCreativeBrief(originalRequest: string): Promise<CreativeBrief> {
  if (isDemoMode()) return createCreativeBriefFallback(originalRequest)

  const result = await invokeJson<CreativeBrief>(
    '把用户需求转换为 CreativeBrief。必须包含 originalRequest、normalizedIntent、outputMode、needsComposition、constraints、assumptions；outputMode 只能是 pure_image、graphic_design、scene_text、both。',
    { originalRequest },
  )
  if (!result?.normalizedIntent || typeof result.needsComposition !== 'boolean') {
    throw new Error('Brief Provider 返回的数据不完整')
  }
  return parseCreativeBrief(JSON.stringify(result), originalRequest)
}

export function createDirectionFallbacks(brief: CreativeBrief): CreativeDirection[] {
  const channel = brief.channel || '通用渠道'
  return [
    {
      id: 'direction-editorial',
      title: '清爽编辑视觉',
      summary: '使用大面积留白和清晰信息层级，强调产品主体与可读性。',
      visualStyle: '现代编辑设计',
      composition: '主体偏右，左侧保留文字安全区',
      colorStrategy: '低饱和背景搭配一组品牌强调色',
      visualFocus: '产品或核心主体近景',
      mood: '清爽、可信、克制',
      copyStyle: '短标题与明确行动语',
      channels: [channel],
    },
    {
      id: 'direction-dynamic',
      title: '动感场景叙事',
      summary: '把主体放入有动作和环境线索的场景，增强情绪与社媒吸引力。',
      visualStyle: '商业摄影与轻电影感',
      composition: '对角线构图与前后景层次',
      colorStrategy: '高对比互补色与明亮高光',
      visualFocus: '主体动作和环境互动',
      mood: '年轻、鲜活、有冲击力',
      copyStyle: '情绪化短句与节奏感排版',
      channels: [channel, '社交媒体'],
    },
    {
      id: 'direction-premium',
      title: '极简品牌主视觉',
      summary: '压缩元素数量，用材质、光影和比例建立高级品牌感。',
      visualStyle: '极简品牌广告',
      composition: '中心构图与几何留白',
      colorStrategy: '单色系渐变与精确品牌色点缀',
      visualFocus: '标志性轮廓和材质细节',
      mood: '高级、安静、确定',
      copyStyle: '极少文案与强标题',
      channels: [channel, '品牌主视觉'],
    },
  ]
}

export function ensureThreeDirections(
  directions: CreativeDirection[] | undefined,
  brief: CreativeBrief,
): CreativeDirection[] {
  const valid = Array.isArray(directions)
    ? directions.filter(
        (direction) =>
          direction &&
          typeof direction.id === 'string' &&
          typeof direction.title === 'string' &&
          typeof direction.composition === 'string',
      )
    : []
  if (valid.length === 3 && new Set(valid.map((item) => item.visualStyle)).size === 3) return valid
  return createDirectionFallbacks(brief)
}

export async function createCreativeDirections(
  brief: CreativeBrief,
  constraints: BrandConstraintPackage,
): Promise<CreativeDirection[]> {
  if (isDemoMode()) return createDirectionFallbacks(brief)
  const result = await invokeJson<{ directions: CreativeDirection[] }>(
    '生成恰好 3 个明显不同的 CreativeDirection。每个方案必须包含 id、title、summary、visualStyle、composition、colorStrategy、visualFocus、mood、copyStyle、channels；三个方案在视觉风格、构图和色彩策略上都要不同。',
    { brief, constraints },
  )
  const valid = result?.directions
  if (!valid || valid.length !== 3 || new Set(valid.map((item) => item.visualStyle)).size !== 3) {
    throw new Error('创意方向 Provider 未返回三个明显不同的有效方案')
  }
  return valid
}

export function createPromptPlanFallback(
  brief: CreativeBrief,
  direction: CreativeDirection,
  constraints: BrandConstraintPackage,
): PromptPlan {
  const constraintText = [...constraints.required, ...constraints.recommended]
    .map((item) => item.description)
    .join('；')
  return {
    selectedDirectionId: direction.id,
    imagePrompt: [
      brief.normalizedIntent,
      direction.visualStyle,
      direction.composition,
      constraintText,
    ]
      .filter(Boolean)
      .join('，'),
    negativePrompt: '低清晰度，畸变主体，乱码文字，错误文字，不可读文字，水印',
    stylePrompt: `${direction.mood}；${direction.colorStrategy}`,
    layoutPlan: brief.needsComposition
      ? {
          canvasRatio: '1:1',
          safeArea: '四周保留 8%，文字区域避免遮挡主体',
          textRegions: brief.textIntent?.headline
            ? [
                {
                  role: 'headline',
                  content: brief.textIntent.headline,
                  position: 'top-left',
                  emphasis: 'strong',
                },
              ]
            : [],
        }
      : undefined,
    generationConfig: { width: 1024, height: 1024, aspectRatio: '1:1' },
  }
}

export async function createPromptPlan(
  brief: CreativeBrief,
  direction: CreativeDirection,
  constraints: BrandConstraintPackage,
): Promise<PromptPlan> {
  if (isDemoMode()) return createPromptPlanFallback(brief, direction, constraints)
  const result = await invokeJson<PromptPlan>(
    '生成 PromptPlan。needsComposition=false 时不得返回 layoutPlan；needsComposition=true 时必须给出文字安全区，且 imagePrompt 不得要求生图模型直接生成最终标题或 Logo。',
    { brief, direction, constraints },
  )
  if (!result?.imagePrompt || (brief.needsComposition && !result.layoutPlan)) {
    throw new Error('Prompt Provider 返回的数据不完整')
  }
  return {
    ...result,
    selectedDirectionId: direction.id,
    layoutPlan: brief.needsComposition ? result.layoutPlan : undefined,
    generationConfig: result.generationConfig || { aspectRatio: '1:1' },
  }
}

function createDemoImage(index: number, prompt: string): CandidateImage {
  const palettes = [
    ['#0B57D0', '#D3E3FD'],
    ['#137333', '#CEEAD6'],
    ['#B06000', '#FEEFC3'],
    ['#7B1FA2', '#EADCF8'],
  ]
  const [primary, secondary] = palettes[index]
  return {
    id: `demo-candidate-${index + 1}`,
    imageUrl: createDemoPngDataUrl(primary, secondary, index),
    prompt,
    model: 'brand-flow-demo-provider',
    seed: 1000 + index,
    metadata: {
      demo: true,
      durationMs: 0,
      dominantColors: [primary, secondary],
      brightness: index % 2 === 0 ? 'bright' : 'balanced',
      temperature: index === 1 ? 'cool' : index === 2 ? 'warm' : 'neutral',
      visualStyle: '柔和渐变商业视觉',
      complexity: 'simple',
    },
  }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function createDemoPngDataUrl(primary: string, secondary: string, index: number): string {
  const width = 512
  const height = 512
  const color = (hex: string) =>
    [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  const from = color(primary)
  const to = color(secondary)
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const ratio = (x + y) / (width + height)
      const offset = row + 1 + x * 4
      const panel = y > 370 && x > 45 && x < 467
      raw[offset] = panel ? 245 : Math.round(from[0] * (1 - ratio) + to[0] * ratio)
      raw[offset + 1] = panel ? 248 : Math.round(from[1] * (1 - ratio) + to[1] * ratio)
      raw[offset + 2] = panel ? 250 : Math.round(from[2] * (1 - ratio) + to[2] * ratio)
      raw[offset + 3] = 255
      if (panel && y > 405 + index * 3 && y < 420 + index * 3 && x > 80 && x < 360)
        raw[offset] = raw[offset + 1] = raw[offset + 2] = 40
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`生成请求超过 ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

export async function generateCandidates(plan: PromptPlan): Promise<CandidateImage[]> {
  if (isDemoMode()) return [0, 1, 2, 3].map((index) => createDemoImage(index, plan.imagePrompt))

  const batch = await withTimeout(
    generateService.generateFourCandidates(plan.imagePrompt, plan.negativePrompt || ''),
    Number(process.env.IMAGE_GENERATION_TIMEOUT_MS || 120000),
  )
  return batch.candidates.map((candidate) => ({
    id: candidate.id,
    imageUrl: candidate.url,
    prompt: candidate.promptUsed,
    seed: candidate.seed,
    model: getOpenAISettings().imageModel,
    metadata: { failed: !candidate.url },
  }))
}

function fallbackEvaluations(candidates: CandidateImage[]): CandidateEvaluation[] {
  return candidates.map((candidate, index) => ({
    candidateId: candidate.id,
    totalScore: 8.6 - index * 0.4,
    scores: {
      brandConsistency: 8.6 - index * 0.3,
      promptAlignment: 8.8 - index * 0.3,
      composition: 8.4 - index * 0.4,
      visualQuality: 8.7 - index * 0.4,
    },
    strengths: ['主体清晰', '构图可继续用于后续流程'],
    issues: candidate.imageUrl ? [] : ['候选图生成失败'],
    recommended: index === 0,
    recommendationReason: index === 0 ? '综合分最高，作为默认候选' : '可作为备选方向',
    source: 'fallback',
  }))
}

export async function evaluateCandidateImages(
  candidates: CandidateImage[],
  constraints: BrandConstraintPackage,
): Promise<CandidateEvaluation[]> {
  const available = candidates.filter((candidate) => candidate.imageUrl)
  if (isDemoMode()) return fallbackEvaluations(candidates)
  if (available.length !== 4) throw new Error('候选图不足 4 张，无法执行完整质检')
  {
    const legacy = available.map((candidate, index) => ({
      id: candidate.id,
      url: candidate.imageUrl,
      index: index + 1,
      promptUsed: candidate.prompt,
      seed: candidate.seed,
    }))
    const result = await evaluateCandidates(legacy, JSON.stringify(constraints))
    if (result.evaluations.length !== 4) throw new Error('候选图质检结果必须严格包含 4 项')
    const candidateIds = new Set(available.map((candidate) => candidate.id))
    const returnedIds = new Set(result.evaluations.map((evaluation) => evaluation.candidateId))
    const validScores = result.evaluations.every((evaluation) =>
      [evaluation.overallScore, ...Object.values(evaluation.dimensionScores)].every(
        (score) => Number.isFinite(score) && score >= 0 && score <= 10,
      ),
    )
    if (
      returnedIds.size !== 4 ||
      [...returnedIds].some((id) => !candidateIds.has(id)) ||
      !candidateIds.has(result.bestCandidateId) ||
      !validScores
    ) {
      throw new Error('候选图质检结果包含未知候选或越界分数')
    }
    return result.evaluations.map((evaluation) => ({
      candidateId: evaluation.candidateId,
      totalScore: evaluation.overallScore,
      scores: {
        brandConsistency: evaluation.dimensionScores.brandCompliance,
        promptAlignment: evaluation.dimensionScores.creativity,
        composition: evaluation.dimensionScores.compositionFit,
        visualQuality: evaluation.dimensionScores.aestheticQuality,
      },
      strengths: [evaluation.comment],
      issues: [],
      recommended: evaluation.candidateId === result.bestCandidateId,
      recommendationReason: evaluation.comment,
      source: 'model',
    }))
  }
}

const SAFE_FONT_FAMILIES = ['Arial', 'Microsoft YaHei', 'Noto Sans SC', 'sans-serif'] as const
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function assertVectorSpec(spec: ArtTextVectorSpec): ArtTextVectorSpec {
  if (!SAFE_FONT_FAMILIES.includes(spec.fontFamily as (typeof SAFE_FONT_FAMILIES)[number])) {
    throw new Error(`艺术字字体不在允许列表中: ${spec.fontFamily}`)
  }
  const colors = [
    spec.fill,
    spec.stroke,
    spec.shadow?.color,
    spec.gradient?.from,
    spec.gradient?.to,
    ...(spec.decorations?.map((item) => item.color) ?? []),
  ].filter((value): value is string => Boolean(value))
  if (colors.some((color) => !HEX_COLOR_PATTERN.test(color))) {
    throw new Error('艺术字颜色必须使用六位 HEX 格式')
  }
  if (spec.fontWeight < 100 || spec.fontWeight > 900 || spec.fontWeight % 100 !== 0) {
    throw new Error('艺术字字重超出允许范围')
  }
  if ((spec.strokeWidth ?? 0) < 0 || (spec.strokeWidth ?? 0) > 12) {
    throw new Error('艺术字描边宽度超出允许范围')
  }
  if (!['left', 'center', 'right'].includes(spec.textAlign)) {
    throw new Error('艺术字对齐方式不合法')
  }
  if (
    spec.shadow &&
    (spec.shadow.blur < 0 ||
      spec.shadow.blur > 50 ||
      Math.abs(spec.shadow.offsetX) > 30 ||
      Math.abs(spec.shadow.offsetY) > 30)
  ) {
    throw new Error('艺术字阴影参数超出允许范围')
  }
  if (spec.gradient && (spec.gradient.angle < 0 || spec.gradient.angle > 360)) {
    throw new Error('艺术字渐变角度超出允许范围')
  }
  if (
    (spec.decorations?.length ?? 0) > 4 ||
    spec.decorations?.some((item) => !['line', 'shape', 'highlight'].includes(item.type))
  ) {
    throw new Error('艺术字装饰参数不合法')
  }
  return spec
}

function createDemoArtTextCandidates(
  input: ArtTextGenerationInput,
  baseCandidate: CandidateImage,
): ArtTextCandidate[] {
  const metadataColors = Array.isArray(baseCandidate.metadata?.dominantColors)
    ? baseCandidate.metadata.dominantColors.filter(
        (color): color is string => typeof color === 'string' && HEX_COLOR_PATTERN.test(color),
      )
    : []
  const [basePrimary = '#0B57D0', baseSecondary = '#D3E3FD'] = metadataColors
  const baseStyleSummary = [
    baseCandidate.metadata?.brightness,
    baseCandidate.metadata?.temperature,
    baseCandidate.metadata?.visualStyle,
    baseCandidate.metadata?.complexity,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('、')
  const specs: Array<{ summary: string; colors: string[]; spec: ArtTextVectorSpec }> = [
    {
      summary: '强描边高对比，适合复杂背景和醒目促销信息',
      colors: ['#FFFFFF', '#14324A'],
      spec: {
        fontFamily: 'Microsoft YaHei',
        fontWeight: 900,
        textAlign: 'center',
        fill: '#FFFFFF',
        stroke: '#14324A',
        strokeWidth: 6,
        shadow: { color: '#000000', blur: 12, offsetX: 3, offsetY: 5 },
      },
    },
    {
      summary: '渐变高光字效，强化明亮、通透和年轻视觉',
      colors: [baseSecondary, basePrimary],
      spec: {
        fontFamily: 'Noto Sans SC',
        fontWeight: 800,
        textAlign: 'center',
        fill: baseSecondary,
        gradient: { from: baseSecondary, to: basePrimary, angle: 90 },
        shadow: { color: '#7A2431', blur: 8, offsetX: 2, offsetY: 4 },
        decorations: [{ type: 'highlight', color: '#FFFFFF' }],
      },
    },
    {
      summary: '极简品牌字，以克制字重和清晰留白保持高级感',
      colors: ['#F7F7F2'],
      spec: {
        fontFamily: 'Arial',
        fontWeight: 600,
        textAlign: 'left',
        fill: '#F7F7F2',
        shadow: { color: '#1B1B1B', blur: 4, offsetX: 1, offsetY: 2 },
      },
    },
    {
      summary: '装饰性海报字，适合强调节奏和活动氛围',
      colors: [basePrimary, '#172A46', '#FFFFFF'],
      spec: {
        fontFamily: 'Microsoft YaHei',
        fontWeight: 900,
        textAlign: 'right',
        fill: basePrimary,
        stroke: '#172A46',
        strokeWidth: 4,
        shadow: { color: '#000000', blur: 10, offsetX: 5, offsetY: 6 },
        decorations: [{ type: 'line', color: '#FFFFFF' }],
      },
    },
  ]
  return specs.map((item, index) => ({
    id: `art-text-${input.baseCandidateId}-${index + 1}`,
    textContent: input.textContent,
    previewUrl: '',
    vectorSpec: assertVectorSpec(item.spec),
    styleSummary: `${item.summary}；底图分析：${baseStyleSummary || '平衡商业视觉'}；用户风格要求：${input.stylePrompt}`,
    dominantColors: item.colors,
    source: 'demo',
  }))
}

export async function generateArtTextCandidates(
  input: ArtTextGenerationInput,
  baseCandidate: CandidateImage,
): Promise<ArtTextCandidate[]> {
  if (!input.textContent.trim()) throw new Error('艺术字文本不能为空')
  if (input.textContent.length > 120) throw new Error('艺术字文本不能超过 120 个字符')
  if (!input.stylePrompt.trim()) throw new Error('艺术字风格提示词不能为空')
  if (isDemoMode()) return createDemoArtTextCandidates(input, baseCandidate)

  const result = await invokeImageJson<{ candidates: ArtTextCandidate[] }>(
    '分析底图色彩、明暗、冷暖、质感和繁简程度，生成恰好四套明显不同的受控艺术字样式。不得修改 textContent，不得返回 SVG/HTML/脚本。fontFamily 只能是 Arial、Microsoft YaHei、Noto Sans SC、sans-serif；颜色只能是六位 HEX；fontWeight 为 100 到 900 的整百数。',
    { input, baseImageMetadata: baseCandidate.metadata },
    baseCandidate.imageUrl,
  )
  if (!result || !Array.isArray(result.candidates) || result.candidates.length !== 4) {
    throw new Error('艺术字 Provider 未返回严格四个候选')
  }
  return result.candidates.map((candidate, index) => {
    if (candidate.textContent !== input.textContent)
      throw new Error('艺术字 Provider 修改了用户文本')
    if (
      !candidate.styleSummary ||
      !Array.isArray(candidate.dominantColors) ||
      candidate.dominantColors.some((color) => !HEX_COLOR_PATTERN.test(color))
    ) {
      throw new Error('艺术字 Provider 返回的风格说明或主色不合法')
    }
    return {
      ...candidate,
      id: candidate.id || `art-text-${input.baseCandidateId}-${index + 1}`,
      previewUrl: '',
      vectorSpec: assertVectorSpec(candidate.vectorSpec),
      source: 'model' as const,
    }
  })
}

export async function createArtTextPlacementPlan(
  candidate: ArtTextCandidate,
  region: ArtTextRegion,
): Promise<ArtTextPlacementPlan> {
  const validRegion =
    [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width >= 0.08 &&
    region.height >= 0.05 &&
    region.x + region.width <= 1 &&
    region.y + region.height <= 1
  if (!validRegion) throw new Error('艺术字框选区域无效或尺寸过小')
  const lines = candidate.textContent.split('\n')
  const longestLine = Math.max(...lines.map((line) => Array.from(line).length), 1)
  if (region.width < Math.min(0.9, longestLine * 0.012) || region.height < lines.length * 0.025) {
    throw new Error('框选区域太小，无法在可读字号下完整放入艺术字')
  }
  if (isDemoMode()) {
    return {
      region,
      scale: 1,
      rotation: 0,
      horizontalAlign: candidate.vectorSpec.textAlign,
      verticalAlign: 'middle',
      opacity: 1,
      blendMode: 'normal',
      contrastEnhancement: candidate.vectorSpec.stroke
        ? { type: 'stroke', color: candidate.vectorSpec.stroke, strength: 0.8 }
        : { type: 'shadow', color: '#000000', strength: 0.45 },
    }
  }
  const plan = await invokeJson<ArtTextPlacementPlan>(
    '只返回区域内的艺术字放置参数。region 必须逐值原样返回；scale 0.1~1；rotation -8~8；opacity 0.4~1；不得移动到区域外。',
    { candidate, region },
  )
  if (!plan || JSON.stringify(plan.region) !== JSON.stringify(region)) {
    throw new Error('放置方案擅自修改了用户框选区域')
  }
  if (
    plan.scale < 0.1 ||
    plan.scale > 1 ||
    plan.rotation < -8 ||
    plan.rotation > 8 ||
    plan.opacity < 0.4 ||
    plan.opacity > 1 ||
    !['left', 'center', 'right'].includes(plan.horizontalAlign) ||
    !['top', 'middle', 'bottom'].includes(plan.verticalAlign) ||
    !['normal', 'multiply', 'screen'].includes(plan.blendMode)
  )
    throw new Error('放置方案参数超出允许范围')
  return plan
}

export function composeFinalImage(
  candidate: CandidateImage,
  brief: CreativeBrief,
): { finalImageUrl: string; sourceCandidateId: string; mode: 'skipped' } {
  if (brief.needsComposition) throw new Error('需要图文合成的工作流必须等待用户完成艺术字流程')
  return { finalImageUrl: candidate.imageUrl, sourceCandidateId: candidate.id, mode: 'skipped' }
}

export async function evaluateFinalImage(
  imageUrl: string,
  constraints: BrandConstraintPackage,
  brief: CreativeBrief,
  composition?: CompositionOutput,
): Promise<FinalEvaluationResult> {
  if (!isDemoMode()) {
    {
      const result = await runFinalEvaluation(
        imageUrl,
        JSON.stringify({
          constraints,
          brief,
          compositionChecks: composition
            ? {
                expectedText: composition.textContent,
                selectedArtTextCandidateId: composition.selectedArtTextCandidateId,
                allowedRegion: composition.placement.region,
                requirements: [
                  '文字必须逐字一致',
                  '艺术字必须完全位于框选区域内',
                  '不得裁切或超出画布',
                  '检查背景对比度和主体遮挡',
                  '检查品牌禁用颜色与 PNG 分辨率',
                ],
              }
            : undefined,
        }),
      )
      const rawScores = [result.overallScore, ...Object.values(result.dimensionScores)]
      if (
        rawScores.some((score) => !Number.isFinite(score) || score < 0 || score > 100) ||
        !Array.isArray(result.deductions) ||
        !Array.isArray(result.suggestions)
      ) {
        throw new Error('最终质检 Provider 返回了越界分数或非法结构')
      }
      const normalizeScore = (value: number) =>
        Math.max(0, Math.min(10, value > 10 ? value / 10 : value))
      const totalScore = normalizeScore(result.overallScore)
      return {
        totalScore,
        passed: result.passed && totalScore >= 7,
        scores: {
          brandConsistency: normalizeScore(result.dimensionScores.brandCompliance),
          requirementAlignment: normalizeScore(result.dimensionScores.technicalQuality),
          composition: normalizeScore(result.dimensionScores.compositionQuality),
          visualQuality: normalizeScore(result.dimensionScores.aestheticQuality),
        },
        deductions: result.deductions.map((item) => ({
          dimension: item.dimension,
          points: normalizeScore(item.deduction),
          reason: item.reason,
        })),
        strengths: result.passed ? ['最终成片满足基础品牌与画面要求'] : [],
        suggestions: result.suggestions,
      }
    }
  }

  return {
    totalScore: 8.6,
    passed: true,
    scores: {
      brandConsistency: 8.6,
      requirementAlignment: 8.8,
      composition: brief.needsComposition ? 8.4 : 8.7,
      visualQuality: 8.6,
      textReadability: brief.needsComposition ? 8.5 : undefined,
    },
    deductions: [],
    strengths: composition
      ? ['结构校验确认文字、候选、区域和 PNG 输出与用户选择一致', '主体与构图清晰']
      : ['需求要点完整', '主体与构图清晰'],
    suggestions: ['正式交付前建议人工确认品牌专有名称和版权素材'],
  }
}
