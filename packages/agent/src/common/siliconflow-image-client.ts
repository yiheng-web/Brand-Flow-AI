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

export async function generateSiliconFlowImages(
  options: GenerateSiliconFlowImagesOptions,
): Promise<string[]> {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 4) {
    throw new Error('SiliconFlow 单次候选数量必须是 1～4 的整数')
  }

  const settings = getSiliconFlowImageSettings()
  const response = await fetch(`${settings.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      prompt: options.prompt,
      image_size: settings.size,
      batch_size: options.count,
      num_inference_steps: settings.numInferenceSteps,
      guidance_scale: settings.guidanceScale,
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
  if (images.length !== options.count) {
    throw new Error(`SiliconFlow 返回 ${images.length} 张图片，期望 ${options.count} 张`)
  }
  return images
}
