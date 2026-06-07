import { BrandGuidelines, BrandContext, BrandConstraintPackage } from './brand-types'
import { searchKnowledge } from '../retrieval'
import { ChatOpenAI } from '@langchain/openai'
import { safeJsonParse } from '../common'

const DEFAULT_BRAND: BrandGuidelines = {
  brandName: '默认品牌',
  brandStyle: ['简约', '现代', '专业'],
  mainColors: ['#ffffff', '#000000'],
  targetAudience: '全年龄段',
  forbiddenContent: ['低俗', '暴力', '违规元素'],
}

export class BrandService {
  private currentBrand: BrandGuidelines | null = null

  setBrandGuidelines(brand: BrandGuidelines): void {
    this.currentBrand = brand
  }

  getBrandGuidelines(): BrandGuidelines {
    return this.currentBrand || DEFAULT_BRAND
  }

  formatBrandContext(brand?: BrandGuidelines): BrandContext {
    const target = brand || this.getBrandGuidelines()
    const formattedText = `
品牌名称：${target.brandName}
品牌风格：${target.brandStyle.join('、')}
主色调：${target.mainColors.join('、')}
目标受众：${target.targetAudience}
禁忌内容：${target.forbiddenContent?.join('、') || '无'}
    `.trim()
    return { formattedBrandText: formattedText, isValid: true }
  }

  // ↓ ========== V1.0 新增 ==========

  /**
   * 构建品牌约束包
   * @param userIntent 用户创作需求（来自需求翻译节点）
   * @param knowledgeBaseIds 用户选择的知识库 ID 列表
   * @param enterpriseId 企业 ID，用于权限过滤
   */
  async buildConstraintPackage(
    userIntent: string,
    knowledgeBaseIds: string[],
    enterpriseId: string,
  ): Promise<BrandConstraintPackage> {
    // 1. 并发检索所有知识库
    const allDocs: { text: string; source: string }[] = []
    for (const kbId of knowledgeBaseIds) {
      try {
        const docs = await searchKnowledge(userIntent, { enterpriseId, knowledgeId: kbId }, 5)
        docs.forEach((d) => allDocs.push({ text: d.pageContent, source: kbId }))
      } catch (e) {
        // 单个知识库失败不影响整体
        console.warn(`知识库 ${kbId} 检索失败:`, e)
      }
    }

    // 2. 无知识库结果时返回默认约束
    if (allDocs.length === 0) {
      return this.buildDefaultConstraint()
    }

    // 3. 让 LLM 分类并生成约束包
    return this.classifyWithLLM(userIntent, allDocs)
  }

  private buildDefaultConstraint(): BrandConstraintPackage {
    const brand = this.getBrandGuidelines()
    return {
      required: [],
      recommended: [
        {
          level: 'recommended',
          ruleName: '默认品牌风格',
          ruleDescription: `品牌风格：${brand.brandStyle.join('、')}，主色调：${brand.mainColors.join('、')}`,
          relevance: 'matched',
          recommendation: `请确保生成内容风格为 ${brand.brandStyle.join('、')}，主色调使用 ${brand.mainColors.join('、')}`,
          sourceKnowledgeName: '系统默认',
        },
      ],
      optional: [],
      summary: `品牌名称：${brand.brandName}\n风格：${brand.brandStyle.join('、')}\n主色调：${brand.mainColors.join('、')}\n禁忌：${brand.forbiddenContent?.join('、') || '无'}`,
    }
  }

  private async classifyWithLLM(
    userIntent: string,
    docs: { text: string; source: string }[],
  ): Promise<BrandConstraintPackage> {
    const llm = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
      temperature: 0.1,
    })

    const docsText = docs
      .map((d, i) => `[文档${i + 1} 来源知识库:${d.source}]\n${d.text}`)
      .join('\n\n')

    const prompt = `
你是一位品牌规范分析专家。请根据用户创作需求和品牌规范文档，提取约束条件并分类。

用户创作需求：
${userIntent}

品牌规范文档：
${docsText}

请严格按以下 JSON 格式输出（不要输出任何其他内容）：

{
  "required": [
    { "ruleName": "规则名称", "ruleDescription": "规则内容", "relevance": "matched", "recommendation": "给图像生成模型的简短提示" }
  ],
  "recommended": [ 同上结构 ],
  "optional": [ 同上结构 ],
  "summary": "50字以内的约束摘要"
}

分类标准：
- required：必须遵守的强制规范（如Logo位置、主色调、禁用元素）
- recommended：建议遵守的规范（如风格倾向、构图偏好）
- optional：可选参考信息（如灵感方向、相关案例）
- relevance：matched表示文档明确提及，partial表示部分相关，unmatched表示不相关（不要输出unmatched的项）
`.trim()

    const response = await llm.invoke(prompt)
    const raw =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
    const json = safeJsonParse<any>(raw, {
      required: [],
      recommended: [],
      optional: [],
      summary: '',
    })

    // 补充 level 和 sourceKnowledgeName
    const enrich = (items: any[], level: 'required' | 'recommended' | 'optional') =>
      (items || []).map((item: any) => ({
        level,
        ruleName: item.ruleName || '',
        ruleDescription: item.ruleDescription || '',
        relevance: item.relevance || 'partial',
        recommendation: item.recommendation || '',
        sourceKnowledgeName: docs[0]?.source || '未知',
      }))

    return {
      required: enrich(json.required || [], 'required'),
      recommended: enrich(json.recommended || [], 'recommended'),
      optional: enrich(json.optional || [], 'optional'),
      summary: json.summary || '无特殊约束',
    }
  }
}

export const brandService = new BrandService()
