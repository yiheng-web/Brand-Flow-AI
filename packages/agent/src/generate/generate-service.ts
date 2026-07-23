import {
  GenerateRequest,
  GenerateResult,
  GenerateType,
  CandidateImage,
  CandidateImageBatch,
} from './generate-types'
import { brandService } from '../brand'
import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { asRunnableLlm } from '../common/langchain-utils'

// 生成服务核心类
export class GenerateService {
  // 原直接初始化改为懒加载，避免模块加载时崩溃
  private _textLlm: ChatOpenAI | null = null

  private get textLlm(): ChatOpenAI {
    if (!this._textLlm) {
      this._textLlm = new ChatOpenAI({
        modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
        temperature: 0.7,
      })
    }
    return this._textLlm
  }

  constructor() {
    // 原代码：this.textLlm = new ChatOpenAI({...}) 已移至 getter 中懒加载
  }

  // 执行生成
  async executeGenerate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const { promptData, generateType = 'image' } = req
      const brand = brandService.getBrandGuidelines()

      let resultContent: string

      if (generateType === 'image') {
        resultContent = await this.callImageGenerationApi(
          promptData.finalPrompt,
          promptData.negativePrompt,
        )
      } else if (generateType === 'text') {
        resultContent = await this.callTextGenerationApi(promptData, brand.brandName)
      } else if (generateType === 'art_text') {
        resultContent = await this.generateSingleSvgDataUrl(
          promptData.finalPrompt,
          '',
          '请根据文案语境自由发挥最合适的版式',
        )
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

  // 调用 硅基流动(SiliconFlow) 文生图 API
  private async callImageGenerationApi(
    prompt: string,
    negativePrompt?: string,
    seed?: number,
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 未配置')
    }

    // 默认回退到硅基流动的官方 Endpoint
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.siliconflow.cn/v1').replace(
      /\/+$/,
      '',
    )
    const url = baseUrl.includes('/v1')
      ? `${baseUrl}/images/generations`
      : `${baseUrl}/v1/images/generations`

    // 组装符合 SiliconFlow 规范的请求体
    const body: any = {
      model: process.env.IMAGE_MODEL || 'Kwai-Kolors/Kolors',
      prompt: prompt,
      image_size: process.env.IMAGE_SIZE || '1024x1024',
      batch_size: parseInt(process.env.IMAGE_BATCH_SIZE || '1', 10),
      num_inference_steps: parseInt(process.env.IMAGE_NUM_INFERENCE_STEPS || '20', 10),
      guidance_scale: parseFloat(process.env.IMAGE_GUIDANCE_SCALE || '7.5'),
    }
    if (negativePrompt) {
      body.negative_prompt = negativePrompt
    }
    if (seed !== undefined) {
      body.seed = seed
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`图片生成 API 错误: ${response.status} ${errorBody}`)
    }

    const data = await response.json()
    // 硅基流动通常返回 { images: [{ url: "..." }] } 也有可能兼容 openai 返回 data
    const imageUrl = data.images?.[0]?.url || data.data?.[0]?.url

    if (!imageUrl) {
      throw new Error('未从 API 响应中找到有效的图片 URL')
    }
    return imageUrl
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

    return result.content.toString()
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

    return result.content.toString()
  }

  /**
   * 生成 4 张候选底图
   * 用 4 次独立 API 调用，每次不同 seed，确保结果有差异
   */
  async generateFourCandidates(
    imagePrompt: string,
    negativePrompt: string,
  ): Promise<CandidateImageBatch> {
    const seeds = this.generateFourSeeds()
    const prefix = `cand_${Date.now()}`

    const results = await Promise.allSettled(
      seeds.map((seed, i) =>
        this.callImageGenerationApi(imagePrompt, negativePrompt, seed).then(
          (url: string) =>
            ({
              id: `${prefix}_${i + 1}`,
              url,
              index: (i + 1) as number,
              promptUsed: imagePrompt,
              seed,
            }) as CandidateImage,
        ),
      ),
    )

    const candidates = results.map((r, i): CandidateImage => {
      if (r.status === 'fulfilled') return r.value
      return {
        id: `${prefix}_${i + 1}`,
        url: '',
        index: i + 1,
        promptUsed: imagePrompt,
        seed: seeds[i],
      }
    }) as [CandidateImage, CandidateImage, CandidateImage, CandidateImage]

    return {
      candidates,
      basePrompt: imagePrompt,
      negativePrompt,
      generatedAt: new Date().toISOString(),
    }
  }

  private generateFourSeeds(): number[] {
    const base = Math.floor(Math.random() * 1000000)
    return [base, base + 1, base + 2, base + 3]
  }

  /**
   * 生成 4 个候选排版 SVG (艺术字/排版文本)
   * 并发调用 4 次 Text LLM，显著提升生成速度和排版多样性
   */
  async generateFourArtTextCandidates(
    textContent: string,
    stylePrompt: string = '',
    negativePrompt: string = '',
  ): Promise<CandidateImageBatch> {
    const prefix = `svg_cand_${Date.now()}`
    const baseStyle = stylePrompt || '现代、极简、富有层级感的干净排版，比如海报风格'

    // 定义 4 种不同的排版倾向，增加多样性
    const variations = [
      '方案1：居中对称排版，主标题最大，副标题在下方。',
      '方案2：左对齐排版，文字大小错落有致，像杂志封面。',
      '方案3：极简风格，留白多，字重对比强。',
      '方案4：带有简单 SVG 线条（如 <line> 或 <path>）修饰的创意排版。',
    ]

    const generateSingleSvg = async (variation: string, index: number) => {
      const url = await this.generateSingleSvgDataUrl(textContent, baseStyle, variation)
      return {
        id: `${prefix}_${index + 1}`,
        url,
        index: index + 1,
        promptUsed: `${baseStyle} - ${variation}`,
        seed: index,
      } as CandidateImage
    }

    // 并发 4 个请求
    const results = await Promise.allSettled(variations.map((v, i) => generateSingleSvg(v, i)))

    const candidates = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      return {
        id: `${prefix}_${i + 1}`,
        url: '',
        index: i + 1,
        promptUsed: stylePrompt,
        seed: i,
      }
    }) as [CandidateImage, CandidateImage, CandidateImage, CandidateImage]

    return {
      candidates,
      basePrompt: `并发生成SVG: ${baseStyle}`,
      negativePrompt,
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * 核心：调用 LLM 生成单张 SVG 排版并转换为 Data URL
   */
  private async generateSingleSvgDataUrl(
    textContent: string,
    baseStyle: string,
    variation: string,
  ): Promise<string> {
    const prompt = `你是一个资深的平面排版设计师和前端工程师。
任务：根据用户提供的文案，利用纯 SVG 技术生成 1 个极具设计感的文字排版方案。

用户文案内容：
"${textContent}"
整体风格要求：${baseStyle}
当前方案版式要求：${variation}

要求：
1. 只生成 1 个 SVG 代码块，放在 \`\`\`xml 和 \`\`\` 之间。
2. viewBox 设为 "0 0 800 400" 或合适的比例。
3. 必须是完全透明背景，不要有 <rect> 填充背景。
4. 使用标准的 SVG <text> 标签，如果需要多行请使用多个 <text> 或 <tspan>。
5. 必须通过字体大小 (font-size)、字重 (font-weight: bold/normal)、颜色 (fill) 建立强烈的视觉层级。
6. 使用干净的无衬线字体，例如 font-family="system-ui, -apple-system, sans-serif"。
7. 确保文案的所有内容都被完整包含进去，根据语意自行断句。`

    const chatPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        '你是一个顶级文字排版设计专家。只输出包裹在 ```xml ``` 中的 SVG 代码，不要多余废话。',
      ],
      ['human', prompt],
    ])

    const chain = chatPrompt.pipe(asRunnableLlm(this.textLlm))
    const result = await chain.invoke({})
    const output = result.content.toString()

    const svgRegex = /<svg[\s\S]*?<\/svg>/gi
    const match = output.match(svgRegex)
    if (!match) return ''

    const base64Svg = Buffer.from(match[0], 'utf-8').toString('base64')
    return `data:image/svg+xml;base64,${base64Svg}`
  }
}

// 单例导出
export const generateService = new GenerateService()
