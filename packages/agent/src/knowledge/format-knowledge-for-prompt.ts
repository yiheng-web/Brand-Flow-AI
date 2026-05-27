import type { KnowledgeItem, KnowledgeType } from '@brand-flow/common'

function joinList(items?: string[]): string {
  if (!items?.length) return '—'
  return items.join('、')
}

function formatBrandProfile(items: KnowledgeItem[]): string {
  if (!items.length) return ''
  const lines = items.map((item) => {
    const c = item.content as {
      brandName?: string
      slogan?: string
      industry?: string
      targetAudience?: string
      brandKeywords?: string[]
      forbiddenKeywords?: string[]
      description?: string
    }
    return [
      `品牌名称：${c.brandName ?? item.title}`,
      `口号：${c.slogan ?? '—'}`,
      `行业：${c.industry ?? '—'}`,
      `目标用户：${c.targetAudience ?? '—'}`,
      `品牌关键词：${joinList(c.brandKeywords)}`,
      `禁忌关键词：${joinList(c.forbiddenKeywords)}`,
      c.description ? `介绍：${c.description}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })
  return `【品牌资料】\n${lines.join('\n\n')}`
}

function formatVisualGuideline(items: KnowledgeItem[]): string {
  if (!items.length) return ''
  const lines = items.map((item) => {
    const c = item.content as {
      primaryColors?: string[]
      secondaryColors?: string[]
      forbiddenColors?: string[]
      fontStyle?: string
      visualStyle?: string
      compositionPreference?: string
      lightingPreference?: string
      texturePreference?: string
    }
    return [
      `主色：${joinList(c.primaryColors)}`,
      `辅助色：${joinList(c.secondaryColors)}`,
      `禁用颜色：${joinList(c.forbiddenColors)}`,
      `字体风格：${c.fontStyle ?? '—'}`,
      `视觉风格：${c.visualStyle ?? '—'}`,
      `构图偏好：${c.compositionPreference ?? '—'}`,
      `光影偏好：${c.lightingPreference ?? '—'}`,
      `质感偏好：${c.texturePreference ?? '—'}`,
    ].join('\n')
  })
  return `【视觉规范】\n${lines.join('\n\n')}`
}

function formatProducts(items: KnowledgeItem[]): string {
  if (!items.length) return ''
  const lines = items.map((item) => {
    const c = item.content as {
      productName?: string
      productDescription?: string
      sellingPoints?: string[]
      scenario?: string
      priceInfo?: string
    }
    return [
      `产品名称：${c.productName ?? item.title}`,
      `卖点：${joinList(c.sellingPoints)}`,
      `适用场景：${c.scenario ?? '—'}`,
      `介绍：${c.productDescription ?? '—'}`,
      c.priceInfo ? `价格/活动：${c.priceInfo}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })
  return `【产品资料】\n${lines.join('\n\n')}`
}

function formatAssets(items: KnowledgeItem[]): string {
  if (!items.length) return ''
  const lines = items.map((item) => {
    const c = item.content as {
      assetName?: string
      assetType?: string
      assetUrl?: string
      usage?: string
    }
    const url = c.assetUrl ?? item.assetUrl ?? '—'
    return `${c.assetName ?? item.title}（${c.assetType ?? '素材'}）：${url}${c.usage ? `，用途：${c.usage}` : ''}`
  })
  return `【素材资产】\n${lines.join('\n')}`
}

function formatReferenceCases(items: KnowledgeItem[]): string {
  if (!items.length) return ''
  const likes: string[] = []
  const dislikes: string[] = []
  for (const item of items) {
    const c = item.content as {
      caseName?: string
      preference?: 'like' | 'dislike'
      reason?: string
      styleTags?: string[]
    }
    const line = `${c.caseName ?? item.title}：${c.reason ?? '—'}（${joinList(c.styleTags)}）`
    if (c.preference === 'dislike') dislikes.push(line)
    else likes.push(line)
  }
  return [
    '【参考案例】',
    likes.length ? `喜欢的风格：\n${likes.join('\n')}` : '',
    dislikes.length ? `不喜欢的风格：\n${dislikes.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatNegativeRules(items: KnowledgeItem[]): string {
  if (!items.length) return ''
  const lines = items.map((item) => {
    const c = item.content as {
      ruleTitle?: string
      ruleContent?: string
      forbiddenElements?: string[]
      forbiddenStyles?: string[]
      forbiddenScenes?: string[]
      forbiddenCopywriting?: string[]
    }
    return [
      `${c.ruleTitle ?? item.title}：${c.ruleContent ?? ''}`,
      `禁用元素：${joinList(c.forbiddenElements)}`,
      `禁用风格：${joinList(c.forbiddenStyles)}`,
      `禁用场景：${joinList(c.forbiddenScenes)}`,
      `禁用文案：${joinList(c.forbiddenCopywriting)}`,
    ].join('\n')
  })
  return `【禁用规则】\n不能出现：\n${lines.join('\n\n')}`
}

function formatLayoutRules(items: KnowledgeItem[]): string {
  if (!items.length) return ''
  const lines = items.map((item) => {
    const c = item.content as {
      ruleTitle?: string
      logoPosition?: string
      titlePosition?: string
      productPosition?: string
      posterRatio?: string
      marginRule?: string
    }
    return [
      `${c.ruleTitle ?? item.title}`,
      `Logo位置：${c.logoPosition ?? '—'}`,
      `标题位置：${c.titlePosition ?? '—'}`,
      `产品位置：${c.productPosition ?? '—'}`,
      `海报比例：${c.posterRatio ?? '—'}`,
      c.marginRule ? `边距规则：${c.marginRule}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })
  return `【版式规则】\n${lines.join('\n\n')}`
}

const FORMATTERS: Record<KnowledgeType, (items: KnowledgeItem[]) => string> = {
  brand_profile: formatBrandProfile,
  visual_guideline: formatVisualGuideline,
  asset: formatAssets,
  product: formatProducts,
  reference_case: formatReferenceCases,
  negative_rule: formatNegativeRules,
  layout_rule: formatLayoutRules,
}

export function formatKnowledgeForPrompt(items: KnowledgeItem[]): string {
  if (!items.length) return ''

  const byType = items.reduce<Record<KnowledgeType, KnowledgeItem[]>>(
    (acc, item) => {
      if (!acc[item.type]) acc[item.type] = []
      acc[item.type].push(item)
      return acc
    },
    {} as Record<KnowledgeType, KnowledgeItem[]>,
  )

  const order: KnowledgeType[] = [
    'brand_profile',
    'visual_guideline',
    'product',
    'asset',
    'reference_case',
    'negative_rule',
    'layout_rule',
  ]

  return order
    .map((type) => FORMATTERS[type](byType[type] ?? []))
    .filter(Boolean)
    .join('\n\n')
}
