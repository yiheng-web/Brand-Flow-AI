import type { IntentOutput } from '../chains/intent-chain'
import type { PromptChainOutput } from '../chains/prompt-chain'

// 评估分数类型
export type EvaluationScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

// 评估单项结果
export interface EvaluationItem {
  score: EvaluationScore
  comment: string
}

// 评估完整输入
export interface EvaluationInput {
  userQuery: string
  intentResult: IntentOutput
  promptResult: PromptChainOutput
  brandGuidelines?: string
}

// 评估完整输出
export interface EvaluationResult {
  overallScore: EvaluationScore
  intentEvaluation: EvaluationItem
  promptEvaluation: EvaluationItem
  complianceEvaluation: EvaluationItem
  suggestions: string[]
  status: 'success' | 'failed'
}
