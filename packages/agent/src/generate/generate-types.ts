// ↑ 旧代码保留不动
import type { PromptChainOutput } from '../ai-logic/chains/prompt-chain'

export type GenerateType = 'image' | 'text' | 'brand_material' | 'art_text'

export interface GenerateRequest {
  promptData: PromptChainOutput
  generateType: GenerateType
  sessionId?: string
}

export interface GenerateResult {
  success: boolean
  content: string
  generateType: GenerateType
  promptUsed: string
  message?: string
}

// ↓ ========== V1.0 新增 ==========

/** 单张候选图 */
export interface CandidateImage {
  id: string
  url: string
  index: number // 1-4
  promptUsed: string
  seed?: number
}

/** 4 张候选图批次（固定 4 张） */
export interface CandidateImageBatch {
  candidates: [CandidateImage, CandidateImage, CandidateImage, CandidateImage]
  basePrompt: string
  negativePrompt: string
  generatedAt: string
}
