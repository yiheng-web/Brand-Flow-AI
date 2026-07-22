import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_CHAT_MODEL = 'gpt-5.6-terra'
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

export interface OpenAISettings {
  apiKey: string
  baseUrl: string
  chatModel: string
  imageModel: string
  embeddingModel: string
}

function requireApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY 未配置')
  return apiKey
}

export function getOpenAISettings(): OpenAISettings {
  return {
    apiKey: requireApiKey(),
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ''),
    chatModel: process.env.OPENAI_MODEL_NAME?.trim() || DEFAULT_CHAT_MODEL,
    imageModel: process.env.IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
    embeddingModel: process.env.EMBEDDING_MODEL_NAME?.trim() || DEFAULT_EMBEDDING_MODEL,
  }
}

export function createOpenAIChatModel(): ChatOpenAI {
  const settings = getOpenAISettings()
  return new ChatOpenAI({
    apiKey: settings.apiKey,
    model: settings.chatModel,
    configuration: { baseURL: settings.baseUrl },
    useResponsesApi: true,
    reasoning: { effort: 'low' },
    maxRetries: 2,
  })
}

export function createOpenAIEmbeddings(): OpenAIEmbeddings {
  const settings = getOpenAISettings()
  return new OpenAIEmbeddings({
    apiKey: settings.apiKey,
    model: settings.embeddingModel,
    configuration: { baseURL: settings.baseUrl },
    maxRetries: 2,
  })
}

export function extractOpenAIText(content: unknown): string {
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
