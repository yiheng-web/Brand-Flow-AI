import { BrandGuidelines } from './brand-types'

// 验证品牌规范是否完整
export function validateBrandGuidelines(brand: Partial<BrandGuidelines>): boolean {
  return !!(brand.brandName && brand.brandStyle && brand.mainColors)
}

// 提取品牌核心关键词
export function extractBrandKeywords(brand: BrandGuidelines): string[] {
  return [...brand.brandStyle, ...brand.mainColors]
}
