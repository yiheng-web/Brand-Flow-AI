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

/** 候选图单张评分 */
export interface CandidateEvaluation {
  candidateId: string
  overallScore: number // 1-10
  dimensionScores: {
    brandCompliance: number
    aestheticQuality: number
    compositionFit: number
    creativity: number
  }
  comment: string
  recommendation: 'recommended' | 'neutral' | 'not_recommended'
}

/** 4 张候选图评分批次 */
export interface CandidateEvaluationBatch {
  evaluations: CandidateEvaluation[]
  bestCandidateId: string
  summary: string
}

/** 最终质检扣分项 */
export interface DeductionItem {
  dimension: string
  deduction: number
  reason: string
  fixable: boolean
}

/** 最终品牌质检结果 */
export interface FinalEvaluationResult {
  overallScore: number // 1-100
  passed: boolean
  dimensionScores: {
    brandCompliance: number
    aestheticQuality: number
    technicalQuality: number
    compositionQuality: number
  }
  deductions: DeductionItem[]
  /** 回溯建议，每条写清应该回溯到哪个节点 */
  suggestions: string[]
  canExport: boolean
}
