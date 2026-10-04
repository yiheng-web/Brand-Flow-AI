import { randomInt } from 'node:crypto'
import type { PromptPlan } from '@brand-flow/contracts'
import { logger } from './logger'

const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'
const DEFAULT_SILICONFLOW_IMAGE_MODEL = 'Kwai-Kolors/Kolors'

export interface SiliconFlowImageSettings {
  apiKey: string
  baseUrl: string
  model: string
  size: string
  numInferenceSteps: number
  guidanceScale: number
  timeoutMs: number
}

interface GenerateSiliconFlowImagesOptions {
  prompt: string
  count: number
  negativePrompt?: string
  generationConfig?: PromptPlan['generationConfig']
}

export interface ResolvedImageConfig {
  numInferenceSteps?: number
  guidanceScale?: number
  width: number
  height: number
  imageSize: string
  aspectRatio: string
  seed: number
}

const KOLORS_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '4:5': '1024x1280',
  '3:4': '768x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
}
const QWEN_SIZES: Record<string, string> = {
  '1:1': '1328x1328',
  '16:9': '1664x928',
  '9:16': '928x1664',
  '3:4': '1140x1472',
}

export function resolveImageGenerationConfig(
  config: PromptPlan['generationConfig'] = {},
  model = DEFAULT_SILICONFLOW_IMAGE_MODEL,
  defaultSize = '1024x1024',
): ResolvedImageConfig {
  const sizes =
    model === DEFAULT_SILICONFLOW_IMAGE_MODEL
      ? KOLORS_SIZES
      : model === 'Qwen/Qwen-Image'
        ? QWEN_SIZES
        : undefined
  if (!sizes) throw new Error(`生图模型 ${model} 尚未配置受支持的生成参数映射`)
  if ((config.width === undefined) !== (config.height === undefined))
    throw new Error('width 与 height 必须同时指定')
  if (config.aspectRatio && !sizes[config.aspectRatio])
    throw new Error(`模型 ${model} 不支持画面比例 ${config.aspectRatio}`)
  const size =
    config.width !== undefined
      ? `${config.width}x${config.height}`
      : config.aspectRatio
        ? sizes[config.aspectRatio]
        : defaultSize
  const match = /^(\d+)x(\d+)$/.exec(size)
  if (!match) throw new Error('图片尺寸必须为 widthxheight')
  const width = Number(match[1]),
    height = Number(match[2])
  const knownSizes = new Set(Object.values(sizes))
  if (
    !knownSizes.has(size) &&
    !(
      model === DEFAULT_SILICONFLOW_IMAGE_MODEL &&
      [width, height].every(
        (side) => Number.isInteger(side) && side >= 512 && side <= 1440 && side % 16 === 0,
      ) &&
      width * height <= 1440 * 1440
    )
  )
    throw new Error(`模型 ${model} 不支持该尺寸 ${size}`)
  if (config.aspectRatio) {
    const [horizontal, vertical] = config.aspectRatio.split(':').map(Number)
    if (Math.abs(width / height / (horizontal / vertical) - 1) > 0.04)
      throw new Error('图片尺寸与指定画面比例不一致')
  }
  const seed = config.seed ?? randomInt(0, 999_999_996)
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 9_999_999_996)
    throw new Error('seed 必须是 0～9999999996 的整数')
  return {
    width,
    height,
    imageSize: size,
    aspectRatio: config.aspectRatio ?? `${width}:${height}`,
    seed,
  }
}

export interface SiliconFlowGeneratedImage {
  imageUrl: string
  seed: number
  model: string
  config: ResolvedImageConfig
}

function readPositiveNumber(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return defaultValue
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} 必须是正数`)
  return value
}

export function getSiliconFlowImageSettings(): SiliconFlowImageSettings {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim()
  if (!apiKey) throw new Error('SILICONFLOW_API_KEY 未配置')

  return {
    apiKey,
    baseUrl: (process.env.SILICONFLOW_BASE_URL?.trim() || DEFAULT_SILICONFLOW_BASE_URL).replace(
      /\/+$/,
      '',
    ),
    model: process.env.IMAGE_MODEL?.trim() || DEFAULT_SILICONFLOW_IMAGE_MODEL,
    size: process.env.IMAGE_SIZE?.trim() || '1024x1024',
    numInferenceSteps: readPositiveNumber('IMAGE_NUM_INFERENCE_STEPS', 20),
    guidanceScale: readPositiveNumber('IMAGE_GUIDANCE_SCALE', 7.5),
    timeoutMs: readPositiveNumber('IMAGE_GENERATION_TIMEOUT_MS', 120000),
  }
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '响应未提供错误详情'
  for (const key of ['message', 'data']) {
    const value = Reflect.get(payload, key)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const error = Reflect.get(payload, 'error')
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message')
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return '响应未提供错误详情'
}

export function extractSiliconFlowImageUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const images = Reflect.get(payload, 'images')
  if (!Array.isArray(images)) return []
  return images
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const url = Reflect.get(item, 'url')
      return typeof url === 'string' ? url.trim() : ''
    })
    .filter(Boolean)
}

export async function generateSiliconFlowImageResults(
  options: GenerateSiliconFlowImagesOptions,
): Promise<SiliconFlowGeneratedImage[]> {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 4) {
    throw new Error('SiliconFlow 单次候选数量必须是 1～4 的整数')
  }

  const settings = getSiliconFlowImageSettings()
  const config = resolveImageGenerationConfig(
    options.generationConfig,
    settings.model,
    settings.size,
  )
  if (
    !Number.isInteger(settings.numInferenceSteps) ||
    settings.numInferenceSteps > 100 ||
    settings.guidanceScale > 20
  )
    throw new Error('生图步数或 guidance_scale 超出 Provider 支持范围')
  // 2026-09-30 起 Provider 移除 batch_size；每张图独立请求并记录实际种子。
  logger.info('SiliconFlow 生图参数', {
    model: settings.model,
    imageSize: config.imageSize,
    seed: config.seed,
    count: options.count,
  })
  return Promise.all(
    Array.from({ length: options.count }, async (_, index) => {
      const seed = config.seed + index
      const response = await fetch(`${settings.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          prompt: options.prompt,
          negative_prompt: options.negativePrompt || undefined,
          image_size: config.imageSize,
          seed,
          num_inference_steps: settings.numInferenceSteps,
          ...(settings.model === DEFAULT_SILICONFLOW_IMAGE_MODEL
            ? { guidance_scale: settings.guidanceScale }
            : {}),
        }),
        signal: AbortSignal.timeout(settings.timeoutMs),
      })

      const payload: unknown = await response.json().catch(() => null)
      const requestId = response.headers.get('x-request-id')
      if (!response.ok) {
        throw new Error(
          `SiliconFlow 图片生成失败: HTTP ${response.status}${requestId ? ` request_id=${requestId}` : ''} ${extractErrorMessage(payload)}`,
        )
      }

      const images = extractSiliconFlowImageUrls(payload)
      if (images.length !== 1) {
        throw new Error(`SiliconFlow 单次请求返回 ${images.length} 张图片，期望 1 张`)
      }
      const actualSeed =
        payload && typeof payload === 'object' ? Reflect.get(payload, 'seed') : undefined
      if (
        actualSeed !== undefined &&
        (!Number.isSafeInteger(actualSeed) || actualSeed < 0 || actualSeed > 9_999_999_999)
      )
        throw new Error('Provider 返回无效种子')
      return {
        imageUrl: images[0],
        seed: actualSeed ?? seed,
        model: settings.model,
        config: {
          ...config,
          seed: actualSeed ?? seed,
          numInferenceSteps: settings.numInferenceSteps,
          ...(settings.model === DEFAULT_SILICONFLOW_IMAGE_MODEL
            ? { guidanceScale: settings.guidanceScale }
            : {}),
        },
      }
    }),
  )
}

export async function generateSiliconFlowImages(
  options: GenerateSiliconFlowImagesOptions,
): Promise<string[]> {
  return (await generateSiliconFlowImageResults(options)).map((image) => image.imageUrl)
}
