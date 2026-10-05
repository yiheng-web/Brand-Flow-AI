import type {
  BrandConstraint,
  BrandConstraintPackage,
  KnowledgeConstraintLevel,
  SpaceType,
} from './index'

export interface ScopedKnowledgeRule extends BrandConstraint {
  level: KnowledgeConstraintLevel
  sourceSpaceType: SpaceType
  sourceSpaceId: string
}

interface ExplicitRule {
  key: string
  value: string
  forbidden: boolean
}

/** 只识别明确的规则标签；自然语言不猜测、不自动裁决。 */
export function explicitKnowledgeRules(content: string): ExplicitRule[] {
  return content.split(/[\n；;]/).flatMap((line) => {
    const match = line
      .trim()
      .match(/^(品牌色|Logo禁用|Logo使用|必用文案|禁用文案)\s*[:：]\s*(.+)$/i)
    if (!match) return []
    const [, label, raw] = match
    const value = raw.trim()
    if (label === '品牌色') {
      const colors = value.match(/#[0-9a-f]{6}\b/gi)
      if (!colors || value.replace(/#[0-9a-f]{6}\b/gi, '').replace(/[\s,，、]/g, '')) return []
      return [
        {
          key: 'brand-color',
          value: [...new Set(colors.map((color) => color.toUpperCase()))].sort().join(','),
          forbidden: false,
        },
      ]
    }
    if (label.toLowerCase().startsWith('logo'))
      return [{ key: `logo:${value}`, value, forbidden: label.toLowerCase() === 'logo禁用' }]
    return [{ key: `copy:${value}`, value, forbidden: label === '禁用文案' }]
  })
}

export function mergeKnowledgeRules(rules: ScopedKnowledgeRule[]): {
  constraints: BrandConstraintPackage
  conflicts: string[]
  warnings: string[]
} {
  const rank = { enterprise: 0, team: 1, personal: 2 }
  const ordered = rules
    .map(
      (rule): ScopedKnowledgeRule => ({
        ...rule,
        level: explicitKnowledgeRules(rule.description).some(
          (entry) => entry.forbidden || entry.key.startsWith('copy:'),
        )
          ? 'required'
          : rule.level,
      }),
    )
    .sort((a, b) => rank[a.sourceSpaceType] - rank[b.sourceSpaceType])
  const hard = ordered.filter((rule) => rule.level === 'required')
  const conflicts: string[] = []
  const warnings: string[] = []
  const kept: ScopedKnowledgeRule[] = []
  // ponytail: 当前逐对校验为 O(n²)，规则达到数千条时改为按明确键索引。
  for (const rule of ordered) {
    const explicit = explicitKnowledgeRules(rule.description)
    for (let index = 0; index < explicit.length; index++) {
      for (const other of explicit.slice(index + 1)) {
        const entry = explicit[index]
        if (
          entry.key === other.key &&
          (entry.forbidden !== other.forbidden || entry.value !== other.value)
        )
          conflicts.push(
            `「${rule.title}」内部规则冲突：${entry.key}（${entry.value} / ${other.value}）`,
          )
      }
    }
    for (const parent of hard) {
      if (
        parent.sourceSpaceType === 'team' &&
        rule.sourceSpaceType === 'team' &&
        parent.sourceSpaceId !== rule.sourceSpaceId
      )
        continue
      if (parent.id === rule.id || rank[parent.sourceSpaceType] > rank[rule.sourceSpaceType])
        continue
      for (const left of explicitKnowledgeRules(parent.description)) {
        for (const right of explicit) {
          if (
            left.key === right.key &&
            (left.forbidden !== right.forbidden || left.value !== right.value)
          )
            conflicts.push(
              `「${rule.title}」与${parent.sourceSpaceType === 'enterprise' ? '企业' : parent.sourceSpaceType === 'team' ? '团队' : '个人'}强制规则「${parent.title}」冲突：${left.key}（${left.value} / ${right.value}）`,
            )
        }
      }
    }
    if (
      explicit.length !== rule.description.split(/[\n；;]/).filter((line) => line.trim()).length &&
      hard.some(
        (parent) =>
          parent.id !== rule.id &&
          rank[parent.sourceSpaceType] <= rank[rule.sourceSpaceType] &&
          !(
            parent.sourceSpaceType === 'team' &&
            rule.sourceSpaceType === 'team' &&
            parent.sourceSpaceId !== rule.sourceSpaceId
          ),
      )
    )
      warnings.push(`「${rule.title}」为自然语言规则，需人工确认不违反继承的强制规则`)
    // 推荐和可选规则按个人 > 团队 > 企业覆盖同一明确键，强制规则完整保留。
    if (explicit.length) {
      for (let index = kept.length - 1; index >= 0; index--) {
        const previous = kept[index]
        if (
          previous.level !== 'required' &&
          explicitKnowledgeRules(previous.description).length === 1 &&
          explicit.length === 1 &&
          !/[\n；;]/.test(previous.description) &&
          !/[\n；;]/.test(rule.description) &&
          explicitKnowledgeRules(previous.description).some((left) =>
            explicit.some((right) => right.key === left.key),
          )
        )
          kept.splice(index, 1)
      }
    }
    kept.push(rule)
  }
  const constraints: BrandConstraintPackage = {
    required: [],
    recommended: [],
    optional: [],
    sources: [],
  }
  for (const { level, ...rule } of kept) {
    constraints[level].push(rule)
    constraints.sources.push({
      knowledgeBaseId: rule.sourceKnowledgeBaseId ?? '',
      itemId: rule.sourceItemId,
      title: rule.title,
      spaceType: rule.sourceSpaceType,
      spaceId: rule.sourceSpaceId,
    })
  }
  if (warnings.length) constraints.warnings = [...new Set(warnings)]
  return { constraints, conflicts: [...new Set(conflicts)], warnings: [...new Set(warnings)] }
}
