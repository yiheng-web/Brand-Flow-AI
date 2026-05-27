import { BrandGuidelines, BrandContext } from './brand-types'

// 默认品牌规范（当未传入品牌数据时使用）
const DEFAULT_BRAND: BrandGuidelines = {
  brandName: '默认品牌',
  brandStyle: ['简约', '现代', '专业'],
  mainColors: ['#ffffff', '#000000'],
  targetAudience: '全年龄段',
  forbiddenContent: ['低俗', '暴力', '违规元素'],
}

export class BrandService {
  private currentBrand: BrandGuidelines | null = null

  // 设置品牌规范（由外部调用，例如从数据库读取后传入）
  setBrandGuidelines(brand: BrandGuidelines): void {
    this.currentBrand = brand
  }

  // 获取品牌规范（优先使用外部设置，否则返回默认）
  getBrandGuidelines(): BrandGuidelines {
    return this.currentBrand || DEFAULT_BRAND
  }

  // 格式化品牌规范为AI可识别的文本
  formatBrandContext(brand?: BrandGuidelines): BrandContext {
    const target = brand || this.getBrandGuidelines()

    const formattedText = `
品牌名称：${target.brandName}
品牌风格：${target.brandStyle.join('、')}
主色调：${target.mainColors.join('、')}
目标受众：${target.targetAudience}
禁忌内容：${target.forbiddenContent?.join('、') || '无'}
    `.trim()

    return {
      formattedBrandText: formattedText,
      isValid: true,
    }
  }
}

// 单例导出（全局复用）
export const brandService = new BrandService()
