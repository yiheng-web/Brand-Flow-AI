import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'

import { brandService } from '../brand'
import { asRunnableLlm } from '../common/langchain-utils'
import { createChatOpenAIFields } from '../common/openai-config'
import { GenerateRequest, GenerateResult } from './generate-types'

type ImageProvider = 'pollinations' | 'openai' | 'siliconflow'

interface OpenAIImageResponse {
  data?: Array<{
    url?: string
  }>
}

interface SiliconFlowImageResponse {
  images?: Array<{
    url?: string
  }>
}

function getImageProvider(): ImageProvider {
  const provider = process.env.IMAGE_PROVIDER
  if (provider === 'openai') return 'openai'
  if (provider === 'siliconflow') return 'siliconflow'
  return 'pollinations'
}

function parseImageSize(size?: string): { width: number; height: number } | undefined {
  if (!size) return undefined

  const match = /^(\d+)x(\d+)$/i.exec(size.trim())
  if (!match) return undefined

  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return undefined
  }

  return { width, height }
}

function appendPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function isOpenAIImageResponse(value: unknown): value is OpenAIImageResponse {
  if (typeof value !== 'object' || value === null) return false
  const data = (value as { data?: unknown }).data
  if (data === undefined) return true
  if (!Array.isArray(data)) return false

  return data.every((item) => {
    if (typeof item !== 'object' || item === null) return false
    const url = (item as { url?: unknown }).url
    return url === undefined || typeof url === 'string'
  })
}

export class GenerateService {
  private _textLlm: ChatOpenAI | null = null

  private get textLlm(): ChatOpenAI {
    if (!this._textLlm) {
      this._textLlm = new ChatOpenAI(createChatOpenAIFields(0.7))
    }
    return this._textLlm
  }

  async executeGenerate(req: GenerateRequest): Promise<GenerateResult> {
    const { promptData, generateType = 'image' } = req

    try {
      const brand = brandService.getBrandGuidelines()
      let resultContent: string

      if (generateType === 'image') {
        resultContent = await this.callImageGenerationApi(promptData.finalPrompt, req.seed)
      } else if (generateType === 'text') {
        resultContent = await this.callTextGenerationApi(promptData, brand.brandName)
      } else {
        resultContent = await this.callBrandMaterialApi(promptData, brand)
      }

      return {
        success: true,
        content: resultContent,
        generateType,
        promptUsed: promptData.finalPrompt,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误'

      return {
        success: false,
        content: '',
        generateType,
        promptUsed: promptData.finalPrompt,
        message,
      }
    }
  }

  private async callImageGenerationApi(prompt: string, seed?: number): Promise<string> {
    switch (getImageProvider()) {
      case 'openai':
        return this.callOpenAIImageGenerationApi(prompt)
      case 'siliconflow':
        return this.callSiliconFlowImageGenerationApi(prompt)
      default:
        return this.callPollinationsImageGenerationApi(prompt, seed)
    }
  }

  private async callPollinationsImageGenerationApi(prompt: string, seed?: number): Promise<string> {
    const query = new URLSearchParams()
    const size = parseImageSize(process.env.IMAGE_SIZE)

    if (size) {
      query.set('width', String(size.width))
      query.set('height', String(size.height))
    }

    if (seed !== undefined) {
      query.set('seed', String(seed))
    }

    const baseUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
    const queryString = query.toString()
    return queryString ? `${baseUrl}?${queryString}` : baseUrl
  }

  private async callOpenAIImageGenerationApi(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 未配置')
    }

    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
    const response = await fetch(appendPath(baseUrl, '/images/generations'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || 'dall-e-3',
        prompt,
        n: 1,
        size: process.env.IMAGE_SIZE || '1024x1024',
        quality: process.env.IMAGE_QUALITY || 'standard',
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`图片生成 API 错误: ${response.status} ${errorBody}`)
    }

    const data: unknown = await response.json()
    if (!isOpenAIImageResponse(data)) {
      throw new Error('图片生成 API 返回格式异常')
    }

    const imageUrl = data.data?.[0]?.url
    if (!imageUrl) {
      throw new Error('图片生成 API 未返回图片 URL')
    }

    return imageUrl
  }

  private async callSiliconFlowImageGenerationApi(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 未配置')
    }

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.siliconflow.cn/v1'
    const response = await fetch(appendPath(baseUrl, '/images/generations'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || 'Kwai-Kolors/Kolors',
        prompt,
        image_size: process.env.IMAGE_SIZE || '1024x1024',
        batch_size: Number(process.env.IMAGE_BATCH_SIZE || 1),
        num_inference_steps: Number(process.env.IMAGE_NUM_INFERENCE_STEPS || 20),
        guidance_scale: Number(process.env.IMAGE_GUIDANCE_SCALE || 7.5),
      }),
    })

    const rawText = await response.text()

    if (!response.ok) {
      let message = rawText
      try {
        const errorBody = JSON.parse(rawText) as { message?: string; data?: string }
        message = errorBody.message || errorBody.data || rawText
      } catch {
        // keep raw text
      }

      throw new Error(`SiliconFlow image generation failed: ${response.status} ${message}`)
    }

    let body: unknown
    try {
      body = JSON.parse(rawText)
    } catch {
      throw new Error('SiliconFlow 图片生成响应不是合法 JSON')
    }

    if (
      typeof body === 'object' &&
      body !== null &&
      'images' in body &&
      Array.isArray((body as SiliconFlowImageResponse).images)
    ) {
      const firstImage = (body as SiliconFlowImageResponse).images?.[0]
      if (firstImage && typeof firstImage.url === 'string') {
        return firstImage.url
      }
    }

    throw new Error('未能从 SiliconFlow 图片生成响应中解析图片 URL')
  }

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

    return result.content.toString()
  }

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

    return result.content.toString()
  }
}

export const generateService = new GenerateService()
