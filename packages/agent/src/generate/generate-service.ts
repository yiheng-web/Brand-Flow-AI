import { GenerateRequest, GenerateResult, GenerateType } from "./generate-types";
import { brandService } from "../brand";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { asRunnableLlm } from "../common/langchain-utils";

// 生成服务核心类
export class GenerateService {
  // 原直接初始化改为懒加载，避免模块加载时崩溃
  private _textLlm: ChatOpenAI | null = null;

  private get textLlm(): ChatOpenAI {
    if (!this._textLlm) {
      this._textLlm = new ChatOpenAI({
        modelName: process.env.OPENAI_MODEL_NAME || "gpt-4o",
        temperature: 0.7,
      });
    }
    return this._textLlm;
  }

  constructor() {
    // 原代码：this.textLlm = new ChatOpenAI({...}) 已移至 getter 中懒加载
  }

  // 执行生成
  async executeGenerate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const { promptData, generateType = "image" } = req;
      const brand = brandService.getBrandGuidelines();

      let resultContent: string;

      if (generateType === "image") {
        resultContent = await this.callImageGenerationApi(promptData.finalPrompt, promptData.negativePrompt);
      } else if (generateType === "text") {
        resultContent = await this.callTextGenerationApi(promptData, brand.brandName);
      } else {
        // brand_material：调用 GPT 生成物料描述
        resultContent = await this.callBrandMaterialApi(promptData, brand);
      }

      return {
        success: true,
        content: resultContent,
        generateType,
        promptUsed: promptData.finalPrompt,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        generateType: req.generateType || "image",
        promptUsed: "",
        message: error instanceof Error 
  ? error.message 
  : "生成失败，请重试",
      };
    }
  }

  // 调用 硅基流动(SiliconFlow) 文生图 API
  private async callImageGenerationApi(prompt: string, negativePrompt?: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 未配置");
    }

    // 默认回退到硅基流动的官方 Endpoint
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
    const url = baseUrl.includes('/v1') ? `${baseUrl}/images/generations` : `${baseUrl}/v1/images/generations`;

    // 组装符合 SiliconFlow 规范的请求体
    const body: any = {
      model: process.env.IMAGE_MODEL || "Kwai-Kolors/Kolors",
      prompt: prompt,
      image_size: process.env.IMAGE_SIZE || "1024x1024",
      batch_size: parseInt(process.env.IMAGE_BATCH_SIZE || "1", 10),
      num_inference_steps: parseInt(process.env.IMAGE_NUM_INFERENCE_STEPS || "20", 10),
      guidance_scale: parseFloat(process.env.IMAGE_GUIDANCE_SCALE || "7.5"),
    };
    if (negativePrompt) {
      body.negative_prompt = negativePrompt;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`图片生成 API 错误: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    // 硅基流动通常返回 { images: [{ url: "..." }] } 也有可能兼容 openai 返回 data
    const imageUrl = data.images?.[0]?.url || data.data?.[0]?.url;
    
    if (!imageUrl) {
      throw new Error("未从 API 响应中找到有效的图片 URL");
    }
    return imageUrl;
  }

  // 调用 GPT 生成品牌文案
  private async callTextGenerationApi(
    promptData: { finalPrompt: string; systemPrompt?: string },
    brandName: string
  ): Promise<string> {

    const chatPrompt = ChatPromptTemplate.fromMessages([
      ["system", promptData.systemPrompt || `你是一位专业的品牌文案撰写专家，为品牌"${brandName}"生成高质量的文案内容。`],
      ["human", `请根据以下需求生成品牌文案：\n\n${promptData.finalPrompt}`],
    ]);

    const chain = chatPrompt.pipe(asRunnableLlm(this.textLlm));
    const result = await chain.invoke({});

    return result.content.toString();
  }

  // 调用 GPT 生成品牌物料
  private async callBrandMaterialApi(
    promptData: { finalPrompt: string; systemPrompt?: string },
    brand: { brandName: string; brandStyle: string[]; mainColors: string[] }
  ): Promise<string> {

    const chatPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `你是一位品牌物料设计师，为品牌生成全套物料描述。\n品牌名称：${brand.brandName}\n品牌风格：${brand.brandStyle.join("、")}\n主色调：${brand.mainColors.join("、")}`,
      ],
      ["human", `生成品牌物料描述：\n\n${promptData.finalPrompt}`],
    ]);

    const chain = chatPrompt.pipe(asRunnableLlm(this.textLlm));
    const result = await chain.invoke({});

    return result.content.toString();
  }
}
// 单例导出
export const generateService = new GenerateService();