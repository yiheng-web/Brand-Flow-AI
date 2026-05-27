import type { PromptChainOutput } from '../ai-logic/chains/prompt-chain'

// 生成类型
export type GenerateType = 'image' | 'text' | 'brand_material'

// 生成请求参数
export interface GenerateRequest {
  promptData: PromptChainOutput
  generateType: GenerateType
  sessionId?: string
}

// 生成结果
export interface GenerateResult {
  success: boolean
  content: string
  generateType: GenerateType
  promptUsed: string
  message?: string
}
