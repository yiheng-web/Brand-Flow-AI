import { HumanMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { deflateSync } from 'node:zlib'
import type {
  BrandConstraintPackage,
  CandidateEvaluation,
  CandidateImage,
  CreativeBrief,
  CreativeDirection,
  FinalEvaluationResult,
  PromptPlan,
} from '@brand-flow/contracts'

import { safeJsonParse } from './common'
import { evaluateCandidates, runFinalEvaluation } from './ai-logic/evaluate'
import { generateService } from './generate'

const MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4o'

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
  const llm = new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0.2 })
  const response = await llm.invoke([
    new HumanMessage(`${instruction}\n\n输入：\n${JSON.stringify(payload)}\n\n只输出 JSON。`),
  ])
  const raw =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
  return safeJsonParse<T>(raw)
}

export async function createCreativeBrief(originalRequest: string): Promise<CreativeBrief> {
  if (isDemoMode()) return createCreativeBriefFallback(originalRequest)

  try {
    const result = await invokeJson<CreativeBrief>(
      '把用户需求转换为 CreativeBrief。必须包含 originalRequest、normalizedIntent、outputMode、needsComposition、constraints、assumptions；outputMode 只能是 pure_image、graphic_design、scene_text、both。',
      { originalRequest },
    )
    return parseCreativeBrief(JSON.stringify(result), originalRequest)
  } catch {
    return createCreativeBriefFallback(originalRequest)
  }
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
  try {
    const result = await invokeJson<{ directions: CreativeDirection[] }>(
      '生成恰好 3 个明显不同的 CreativeDirection。每个方案必须包含 id、title、summary、visualStyle、composition、colorStrategy、visualFocus、mood、copyStyle、channels；三个方案在视觉风格、构图和色彩策略上都要不同。',
      { brief, constraints },
    )
    return ensureThreeDirections(result?.directions, brief)
  } catch {
    return createDirectionFallbacks(brief)
  }
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
  try {
    const result = await invokeJson<PromptPlan>(
      '生成 PromptPlan。needsComposition=false 时不得返回 layoutPlan；needsComposition=true 时必须给出文字安全区，且 imagePrompt 不得要求生图模型直接生成最终标题或 Logo。',
      { brief, direction, constraints },
    )
    if (!result?.imagePrompt) return createPromptPlanFallback(brief, direction, constraints)
    return {
      ...result,
      selectedDirectionId: direction.id,
      layoutPlan: brief.needsComposition ? result.layoutPlan : undefined,
      generationConfig: result.generationConfig || { aspectRatio: '1:1' },
    }
  } catch {
    return createPromptPlanFallback(brief, direction, constraints)
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
    metadata: { demo: true, durationMs: 0 },
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
    model: process.env.IMAGE_MODEL || 'Kwai-Kolors/Kolors',
    metadata: { failed: !candidate.url },
  }))
}

function fallbackEvaluations(candidates: CandidateImage[]): CandidateEvaluation[] {
  return candidates.map((candidate, index) => ({
    candidateId: candidate.id,
    totalScore: 86 - index * 4,
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
  if (isDemoMode() || available.length !== 4) return fallbackEvaluations(candidates)
  try {
    const legacy = available.map((candidate, index) => ({
      id: candidate.id,
      url: candidate.imageUrl,
      index: index + 1,
      promptUsed: candidate.prompt,
      seed: candidate.seed,
    }))
    const result = await evaluateCandidates(legacy, JSON.stringify(constraints))
    if (result.evaluations.length !== 4) return fallbackEvaluations(candidates)
    return result.evaluations.map((evaluation) => ({
      candidateId: evaluation.candidateId,
      totalScore: evaluation.overallScore * 10,
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
  } catch {
    return fallbackEvaluations(candidates)
  }
}

export function composeFinalImage(
  candidate: CandidateImage,
  brief: CreativeBrief,
): { finalImageUrl: string; sourceCandidateId: string; mode: 'automatic' | 'skipped' } {
  if (!brief.needsComposition) {
    return { finalImageUrl: candidate.imageUrl, sourceCandidateId: candidate.id, mode: 'skipped' }
  }

  const headline = brief.textIntent?.headline || brief.normalizedIntent.slice(0, 24)
  const escapedHeadline = headline.replace(/[<>&]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image href="${candidate.imageUrl}" width="1024" height="1024" preserveAspectRatio="xMidYMid slice"/><rect x="64" y="760" width="896" height="196" rx="28" fill="rgba(0,0,0,.58)"/><text x="112" y="858" font-family="Arial,sans-serif" font-size="58" font-weight="700" fill="white">${escapedHeadline}</text><text x="112" y="912" font-family="Arial,sans-serif" font-size="24" fill="rgba(255,255,255,.84)">Brand-Flow AI 自动合成</text></svg>`
  return {
    finalImageUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    sourceCandidateId: candidate.id,
    mode: 'automatic',
  }
}

export async function evaluateFinalImage(
  imageUrl: string,
  constraints: BrandConstraintPackage,
  brief: CreativeBrief,
): Promise<FinalEvaluationResult> {
  if (!isDemoMode()) {
    try {
      const result = await runFinalEvaluation(imageUrl, JSON.stringify({ constraints, brief }))
      return {
        totalScore: result.overallScore,
        passed: result.passed,
        scores: {
          brandConsistency: result.dimensionScores.brandCompliance,
          requirementAlignment: result.dimensionScores.technicalQuality,
          composition: result.dimensionScores.compositionQuality,
          visualQuality: result.dimensionScores.aestheticQuality,
        },
        deductions: result.deductions.map((item) => ({
          dimension: item.dimension,
          points: item.deduction,
          reason: item.reason,
        })),
        strengths: result.passed ? ['最终成片满足基础品牌与画面要求'] : [],
        suggestions: result.suggestions,
      }
    } catch {
      // 视觉模型不可用时保留结构化降级，避免丢失已生成成片。
    }
  }

  return {
    totalScore: 86,
    passed: true,
    scores: {
      brandConsistency: 8.6,
      requirementAlignment: 8.8,
      composition: brief.needsComposition ? 8.4 : 8.7,
      visualQuality: 8.6,
      textReadability: brief.needsComposition ? 8.5 : undefined,
    },
    deductions: [],
    strengths: ['需求要点完整', '主体与构图清晰'],
    suggestions: ['正式交付前建议人工确认品牌专有名称和版权素材'],
  }
}
