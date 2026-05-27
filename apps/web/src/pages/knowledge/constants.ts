import type { KnowledgeType } from '@brand-flow/common'

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeType, string> = {
  brand_profile: '品牌资料',
  visual_guideline: '视觉规范',
  asset: '素材资产',
  product: '产品信息',
  reference_case: '参考案例',
  negative_rule: '禁用规则',
  layout_rule: '版式规则',
}

export const KNOWLEDGE_CATEGORIES: KnowledgeType[] = [
  'brand_profile',
  'visual_guideline',
  'asset',
  'product',
  'reference_case',
  'negative_rule',
  'layout_rule',
]
