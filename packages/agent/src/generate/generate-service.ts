import {
  GenerateRequest,
  GenerateResult,
  CandidateImage,
  CandidateImageBatch,
} from './generate-types'
import { brandService } from '../brand'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { asRunnableLlm } from '../common/langchain-utils'
import { createSiliconFlowChatModel, extractChatText } from '../common/siliconflow-chat'
import { generateSiliconFlowImages } from '../common/siliconflow-image-client'
import type { ChatOpenAI } from '@langchain/openai'

// 生成服务核心类
export class GenerateService {
  // 懒加载模型客户端，避免演示模式在模块加载时要求 API Key
  private _textLlm: ChatOpenAI | null = null

  private get textLlm(): ChatOpenAI {
    if (!this._textLlm) {
      this._textLlm = createSiliconFlowChatModel()
    }
    return this._textLlm
  }

  // 执行生成
  async executeGenerate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const { promptData, generateType = 'image' } = req
      const brand = brandService.getBrandGuidelines()

      let resultContent: string

      if (generateType === 'image') {
        const [image] = await this.callImageGenerationApi(
          promptData.finalPrompt,
          promptData.negativePrompt,
        )
        resultContent = image
      } else if (generateType === 'text') {
        resultContent = await this.callTextGenerationApi(promptData, brand.brandName)
      } else if (generateType === 'art_text') {
        throw new Error('旧艺术字 SVG 生成入口已停用，请使用受控 ArtTextVectorSpec 流程')
      } else {
        // brand_material：调用 GPT 生成物料描述
        resultContent = await this.callBrandMaterialApi(promptData, brand)
      }

      return {
        success: true,
        content: resultContent,
        generateType,
        promptUsed: promptData.finalPrompt,
      }
    } catch (error) {
      return {
        success: false,
        content: '',
        generateType: req.generateType || 'image',
        promptUsed: '',
        message: error instanceof Error ? error.message : '生成失败，请重试',
      }
    }
  }

  // 底图生成使用独立 SiliconFlow Provider，避免把 Codex 中转站凭据发送给图片服务
  private async callImageGenerationApi(
    prompt: string,
    negativePrompt?: string,
    count = 1,
  ): Promise<string[]> {
    const finalPrompt = negativePrompt ? `${prompt}\n\n必须避免：${negativePrompt}` : prompt
    return generateSiliconFlowImages({ prompt: finalPrompt, count })
  }

  // 调用 GPT 生成品牌文案
  private async callTextGenerationApi(
    promptData: { finalPrompt: string; systemPrompt?: string },
    brandName: string,
  ): Promise<string> {
    const chatPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        promptData.systemPrompt ||
          `你是一位专业的品牌文案撰写专家，为品牌"${brandName}"生成高质量的文案内容。`,
      ],
      ['human', `请根据以下需求生成品牌文案：\n\n${promptData.finalPrompt}`],
    ])

    const chain = chatPrompt.pipe(asRunnableLlm(this.textLlm))
    const result = await chain.invoke({})

    return extractChatText(result.content)
  }

  // 调用 GPT 生成品牌物料
  private async callBrandMaterialApi(
    promptData: { finalPrompt: string; systemPrompt?: string },
    brand: { brandName: string; brandStyle: string[]; mainColors: string[] },
  ): Promise<string> {
    const chatPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `你是一位品牌物料设计师，为品牌生成全套物料描述。\n品牌名称：${brand.brandName}\n品牌风格：${brand.brandStyle.join('、')}\n主色调：${brand.mainColors.join('、')}`,
      ],
      ['human', `生成品牌物料描述：\n\n${promptData.finalPrompt}`],
    ])

    const chain = chatPrompt.pipe(asRunnableLlm(this.textLlm))
    const result = await chain.invoke({})

    return extractChatText(result.content)
  }

  /**
   * 使用 SiliconFlow 图片接口生成严格四张候选底图。
   */
  async generateFourCandidates(
    imagePrompt: string,
    negativePrompt: string,
  ): Promise<CandidateImageBatch> {
    const prefix = `cand_${Date.now()}`
    const images = await this.callImageGenerationApi(imagePrompt, negativePrompt, 4)
    const candidates = images.map(
      (url, index): CandidateImage => ({
        id: `${prefix}_${index + 1}`,
        url,
        index: index + 1,
        promptUsed: imagePrompt,
      }),
    ) as [CandidateImage, CandidateImage, CandidateImage, CandidateImage]

    return {
      candidates,
      basePrompt: imagePrompt,
      negativePrompt,
      generatedAt: new Date().toISOString(),
    }
  }
}

// 单例导出
export const generateService = new GenerateService()
