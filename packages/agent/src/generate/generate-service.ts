import {
  GenerateRequest,
  GenerateResult,
  CandidateImage,
  CandidateImageBatch,
} from './generate-types'
import { brandService } from '../brand'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { asRunnableLlm } from '../common/langchain-utils'
import {
  createOpenAIChatModel,
  extractOpenAIText,
  getOpenAISettings,
} from '../common/openai-config'
import type { ChatOpenAI } from '@langchain/openai'

// 生成服务核心类
export class GenerateService {
  // 懒加载模型客户端，避免演示模式在模块加载时要求 API Key
  private _textLlm: ChatOpenAI | null = null

  private get textLlm(): ChatOpenAI {
    if (!this._textLlm) {
      this._textLlm = createOpenAIChatModel()
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

  // 调用 OpenAI Image API 生成 PNG Data URL
  private async callImageGenerationApi(
    prompt: string,
    negativePrompt?: string,
    count = 1,
  ): Promise<string[]> {
    const settings = getOpenAISettings()
    const url = `${settings.baseUrl}/images/generations`
    const finalPrompt = negativePrompt ? `${prompt}\n\n必须避免：${negativePrompt}` : prompt
    const timeoutMs = Number(process.env.IMAGE_GENERATION_TIMEOUT_MS || 120000)

    const body = {
      model: settings.imageModel,
      prompt: finalPrompt,
      n: count,
      size: process.env.IMAGE_SIZE || '1024x1024',
      quality: process.env.IMAGE_QUALITY || 'medium',
      output_format: 'png',
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const requestId = response.headers.get('x-request-id')
      const errorBody = (await response.text()).slice(0, 500)
      throw new Error(
        `OpenAI 图片生成失败: HTTP ${response.status}${requestId ? ` request_id=${requestId}` : ''} ${errorBody}`,
      )
    }

    const data: unknown = await response.json()
    const items =
      data && typeof data === 'object' && Array.isArray(Reflect.get(data, 'data'))
        ? Reflect.get(data, 'data')
        : []
    const images = items
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return ''
        const base64 = Reflect.get(item, 'b64_json')
        if (typeof base64 === 'string' && base64) return `data:image/png;base64,${base64}`
        const urlValue = Reflect.get(item, 'url')
        return typeof urlValue === 'string' ? urlValue : ''
      })
      .filter((value: string) => value.length > 0)

    if (images.length !== count) {
      throw new Error(`OpenAI 图片生成返回 ${images.length} 张，期望 ${count} 张`)
    }
    return images
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

    return extractOpenAIText(result.content)
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

    return extractOpenAIText(result.content)
  }

  /**
   * 使用 OpenAI Image API 一次生成严格四张候选底图。
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
