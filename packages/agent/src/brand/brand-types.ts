// 品牌核心规范类型
export interface BrandGuidelines {
  brandName: string
  brandStyle: string[]
  mainColors: string[]
  targetAudience: string
  brandMission?: string
  forbiddenContent?: string[]
}

// 品牌上下文格式化输出
export interface BrandContext {
  formattedBrandText: string
  isValid: boolean
}

/** 匹配级别 */
export type MatchLevel = 'required' | 'recommended' | 'optional'

/** 单条品牌规范匹配结果 */
export interface BrandMatchItem {
  level: MatchLevel
  ruleName: string
  ruleDescription: string
  relevance: 'matched' | 'partial' | 'unmatched'
  recommendation: string
  sourceKnowledgeName: string
}

/** 品牌约束节点完整输出 */
export interface BrandConstraintPackage {
  required: BrandMatchItem[]
  recommended: BrandMatchItem[]
  optional: BrandMatchItem[]
  /** 人类可读摘要，可直接注入下游 Prompt */
  summary: string
}
