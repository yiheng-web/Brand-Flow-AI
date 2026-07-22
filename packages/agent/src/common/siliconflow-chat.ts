import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'

const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'
const DEFAULT_SILICONFLOW_CHAT_MODEL = 'Pro/moonshotai/Kimi-K2.6'
const DEFAULT_SILICONFLOW_EMBEDDING_MODEL = 'BAAI/bge-m3'

export interface SiliconFlowChatSettings {
  apiKey: string
  baseUrl: string
  chatModel: string
  embeddingModel: string
}

export function getSiliconFlowChatSettings(): SiliconFlowChatSettings {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim()
  if (!apiKey) throw new Error('SILICONFLOW_API_KEY 未配置')

  return {
    apiKey,
    baseUrl: (process.env.SILICONFLOW_BASE_URL?.trim() || DEFAULT_SILICONFLOW_BASE_URL).replace(
      /\/+$/,
      '',
    ),
    chatModel: process.env.SILICONFLOW_CHAT_MODEL?.trim() || DEFAULT_SILICONFLOW_CHAT_MODEL,
    embeddingModel:
      process.env.SILICONFLOW_EMBEDDING_MODEL?.trim() || DEFAULT_SILICONFLOW_EMBEDDING_MODEL,
  }
}

export function createSiliconFlowChatModel(): ChatOpenAI {
  const settings = getSiliconFlowChatSettings()
  return new ChatOpenAI({
    apiKey: settings.apiKey,
    model: settings.chatModel,
    configuration: { baseURL: settings.baseUrl },
    useResponsesApi: false,
    maxRetries: 2,
  })
}

export function createSiliconFlowEmbeddings(): OpenAIEmbeddings {
  const settings = getSiliconFlowChatSettings()
  return new OpenAIEmbeddings({
    apiKey: settings.apiKey,
    model: settings.embeddingModel,
    configuration: { baseURL: settings.baseUrl },
    maxRetries: 2,
  })
}

export function extractChatText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const text = Reflect.get(item, 'text')
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)
    .join('\n')
}

const LOCAL_VISION_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function prepareSiliconFlowVisionImage(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) return imageUrl

  let url: URL
  try {
    url = new URL(imageUrl)
  } catch {
    throw new Error('视觉图片 URL 无效')
  }
  if (!LOCAL_VISION_HOSTS.has(url.hostname)) return imageUrl

  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`读取本地视觉图片失败: HTTP ${response.status}`)

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || ''
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`本地视觉图片 MIME 不受支持: ${mimeType || 'unknown'}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const maxBytes = Number(process.env.VISION_INLINE_IMAGE_MAX_BYTES || 20 * 1024 * 1024)
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('VISION_INLINE_IMAGE_MAX_BYTES 必须是正数')
  }
  if (buffer.length > maxBytes) {
    throw new Error(`本地视觉图片超过内联限制: ${buffer.length} > ${maxBytes}`)
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}
