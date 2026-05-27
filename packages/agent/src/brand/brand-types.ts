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
