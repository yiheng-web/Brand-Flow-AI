import type { ChatOpenAIFields } from '@langchain/openai'

const DEFAULT_TEXT_MODEL = 'deepseek-ai/DeepSeek-V3'
const DEFAULT_TEXT_BASE_URL = 'https://api.siliconflow.cn/v1'

const PLACEHOLDER_API_KEYS = new Set([
  '',
  'sk-xxxxxxx',
  'sk-xxxxxxxx',
  'sk-your-siliconflow-api-key',
])

export function isAiMockMode(): boolean {
  return process.env.AI_MOCK_MODE === 'true'
}

export function getOpenAiBaseUrl(): string {
  return process.env.OPENAI_BASE_URL ?? DEFAULT_TEXT_BASE_URL
}

export function isPlaceholderOpenAiApiKey(apiKey?: string): boolean {
  const key = apiKey?.trim() ?? ''
  if (PLACEHOLDER_API_KEYS.has(key)) return true
  if (/^sk-your-/i.test(key)) return true
  if (/^sk-x{4,}$/i.test(key)) return true
  if (/placeholder|example|changeme/i.test(key)) return true
  return false
}

export function assertOpenAiConfigured(): void {
  if (isAiMockMode()) return

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY 未配置：请在 apps/api/.env 中设置 SiliconFlow 密钥，或设置 AI_MOCK_MODE=true 进行本地演示',
    )
  }

  if (isPlaceholderOpenAiApiKey(apiKey)) {
    throw new Error(
      'OPENAI_API_KEY 仍为占位符：请替换为有效的 SiliconFlow 密钥（https://cloud.siliconflow.cn/account/ak）',
    )
  }
}

/** 将 LangChain / OpenAI 兼容接口的鉴权错误转为可读说明 */
export function formatLlmError(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === 'string' ? error : '未知错误'
  }

  const raw = error.message
  const lower = raw.toLowerCase()

  if (
    lower.includes('401') ||
    lower.includes('api key is invalid') ||
    lower.includes('incorrect api key') ||
    lower.includes('model_authentication') ||
    lower.includes('invalid_api_key')
  ) {
    return [
      '大模型 API 认证失败（401）',
      `请确认 apps/api/.env 中 OPENAI_API_KEY 在 ${getOpenAiBaseUrl()} 有效且未过期`,
      '本地 UI 调试可设置 AI_MOCK_MODE=true 跳过真实模型调用',
    ].join('；')
  }

  if (lower.includes('openai_api_key') && lower.includes('未配置')) {
    return raw
  }

  if (isPlaceholderOpenAiApiKey(process.env.OPENAI_API_KEY)) {
    return 'OPENAI_API_KEY 仍为占位符，请替换为有效的 SiliconFlow 密钥'
  }

  return raw
}

export function createChatOpenAIFields(temperature: number): ChatOpenAIFields {
  assertOpenAiConfigured()

  return {
    model: process.env.OPENAI_MODEL_NAME ?? DEFAULT_TEXT_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
    temperature,
    configuration: {
      baseURL: getOpenAiBaseUrl(),
    },
  }
}

export interface OpenAiKeyCheckResult {
  ok: boolean
  message: string
}

/** 启动时探测密钥是否被 SiliconFlow / OpenAI 兼容网关接受 */
export async function verifyOpenAiApiKey(): Promise<OpenAiKeyCheckResult> {
  if (isAiMockMode()) {
    return { ok: true, message: 'AI_MOCK_MODE=true，已跳过密钥校验' }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, message: 'OPENAI_API_KEY 未配置' }
  }

  if (isPlaceholderOpenAiApiKey(apiKey)) {
    return { ok: false, message: 'OPENAI_API_KEY 仍为占位符' }
  }

  const baseUrl = getOpenAiBaseUrl().replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL_NAME ?? DEFAULT_TEXT_MODEL

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    })

    if (response.ok) {
      return { ok: true, message: '大模型 API 密钥校验通过' }
    }

    const body = (await response.text()).slice(0, 200)
    if (response.status === 401) {
      return {
        ok: false,
        message: `大模型 API 密钥无效（401）: ${body || '无响应体'}`,
      }
    }

    return {
      ok: false,
      message: `大模型 API 探测失败（${response.status}）: ${body || '无响应体'}`,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '网络异常'
    return { ok: false, message: `无法连接大模型网关: ${message}` }
  }
}
