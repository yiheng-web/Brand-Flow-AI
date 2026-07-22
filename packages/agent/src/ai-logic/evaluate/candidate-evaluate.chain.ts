import { HumanMessage } from '@langchain/core/messages'
import { safeJsonParse } from '../../common'
import {
  createSiliconFlowChatModel,
  extractChatText,
  prepareSiliconFlowVisionImage,
} from '../../common/siliconflow-chat'
import { CANDIDATE_EVALUATE_PROMPT } from '../prompts/candidate-evaluate-prompt'
import type { CandidateImage } from '../../generate/generate-types'
import type { CandidateEvaluationBatch } from './evaluate-types'

export async function evaluateCandidates(
  candidates: CandidateImage[],
  constraintSummary: string,
): Promise<CandidateEvaluationBatch> {
  const llm = createSiliconFlowChatModel()
  const imageUrls = await Promise.all(
    candidates.map((candidate) => prepareSiliconFlowVisionImage(candidate.url)),
  )

  // 用 HumanMessage + 图片 URL 启用 vision
  const message = new HumanMessage({
    content: [
      {
        type: 'text',
        text: CANDIDATE_EVALUATE_PROMPT.replace('{constraintSummary}', constraintSummary)
          .replace('{image1Url}', candidates[0]?.url || '')
          .replace('{image2Url}', candidates[1]?.url || '')
          .replace('{image3Url}', candidates[2]?.url || '')
          .replace('{image4Url}', candidates[3]?.url || ''),
      },
      ...imageUrls.map((url) => ({
        type: 'image_url' as const,
        image_url: { url },
      })),
    ],
  })

  const response = await llm.invoke([message])
  const raw = extractChatText(response.content)

  const parsed = safeJsonParse<CandidateEvaluationBatch>(raw)
  if (!parsed) throw new Error('候选质检 Provider 返回了无法解析的结果')
  return parsed
}
