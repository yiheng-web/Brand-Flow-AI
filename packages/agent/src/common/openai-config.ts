import type { ChatOpenAIFields } from '@langchain/openai'

const DEFAULT_TEXT_MODEL = 'deepseek-ai/DeepSeek-V3'
const DEFAULT_TEXT_BASE_URL = 'https://api.siliconflow.cn/v1'

export function createChatOpenAIFields(temperature: number): ChatOpenAIFields {
  return {
    model: process.env.OPENAI_MODEL_NAME ?? DEFAULT_TEXT_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
    temperature,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL ?? DEFAULT_TEXT_BASE_URL,
    },
  }
}

export function isAiMockMode(): boolean {
  return process.env.AI_MOCK_MODE === 'true'
}
