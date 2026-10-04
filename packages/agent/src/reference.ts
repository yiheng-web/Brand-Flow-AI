import { HumanMessage } from '@langchain/core/messages'
import type { ResolvedWorkflowReference } from '@brand-flow/contracts'
import {
  createSiliconFlowChatModel,
  extractChatText,
  getSiliconFlowVisionTimeoutMs,
  SILICONFLOW_JSON_CALL_OPTIONS,
} from './common/siliconflow-chat'
import { safeJsonParse } from './common'
import { REFERENCE_VISION_PROMPT } from './ai-logic/prompts/reference.prompt'

export async function extractReferenceConstraints(
  reference: ResolvedWorkflowReference,
): Promise<ResolvedWorkflowReference> {
  if (reference.strategy === 'compose_logo') return reference
  if (process.env.BRAND_FLOW_DEMO_MODE === 'true')
    return {
      ...reference,
      visualConstraints: {
        description: `演示参考：${reference.name}（未调用视觉模型）`,
        colors: [],
        shape: '',
        material: '',
        composition: '',
        source: 'demo',
      },
    }
  const response = await createSiliconFlowChatModel().invoke(
    [
      new HumanMessage({
        content: [
          { type: 'text', text: REFERENCE_VISION_PROMPT },
          { type: 'image_url', image_url: { url: reference.imageUrl } },
        ],
      }),
    ],
    {
      ...SILICONFLOW_JSON_CALL_OPTIONS,
      signal: AbortSignal.timeout(getSiliconFlowVisionTimeoutMs()),
    },
  )
  const value = safeJsonParse<Record<string, unknown>>(extractChatText(response.content))
  const keys = ['description', 'shape', 'material', 'composition'] as const
  if (
    !value ||
    keys.some((key) => typeof value[key] !== 'string' || (value[key] as string).length > 2000) ||
    !Array.isArray(value.colors) ||
    value.colors.length > 12 ||
    value.colors.some((color) => typeof color !== 'string' || color.length > 100)
  )
    throw new Error('参考图视觉特征解析失败')
  if (!(value.description as string).trim()) throw new Error('参考图缺少可见特征描述')
  return {
    ...reference,
    visualConstraints: {
      description: value.description as string,
      colors: value.colors as string[],
      shape: value.shape as string,
      material: value.material as string,
      composition: value.composition as string,
      source: 'vision',
    },
  }
}

export function referenceConstraintText(references: ResolvedWorkflowReference[]): string[] {
  return references.map((reference) =>
    reference.strategy === 'compose_logo'
      ? `Logo「${reference.name}」来自素材 ${reference.assetId}，保留原始素材用于后续 logo 图层合成，底图不得生成或模仿该 Logo。`
      : `${reference.role} 参考「${reference.name}」（素材 ${reference.assetId}）：${JSON.stringify(reference.visualConstraints)}`,
  )
}
