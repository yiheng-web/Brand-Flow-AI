import { HumanMessage } from '@langchain/core/messages'
import { safeJsonParse } from '../../common'
import {
  createSiliconFlowChatModel,
  extractChatText,
  getSiliconFlowVisionTimeoutMs,
  prepareSiliconFlowVisionImage,
  SILICONFLOW_JSON_CALL_OPTIONS,
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
        text: buildCandidateEvaluationPrompt(candidates, constraintSummary),
      },
      ...imageUrls.map((url) => ({
        type: 'image_url' as const,
        image_url: { url },
      })),
    ],
  })

  const response = await llm.invoke([message], {
    ...SILICONFLOW_JSON_CALL_OPTIONS,
    signal: AbortSignal.timeout(getSiliconFlowVisionTimeoutMs()),
  })
  const raw = extractChatText(response.content)

  const parsed = safeJsonParse<CandidateEvaluationBatch>(raw)
  if (!parsed) throw new Error('候选质检 Provider 返回了无法解析的结果')
  return parsed
}

export function buildCandidateEvaluationPrompt(
  candidates: CandidateImage[],
  constraintSummary: string,
): string {
  let prompt = CANDIDATE_EVALUATE_PROMPT.replace('{constraintSummary}', constraintSummary)
  for (let index = 0; index < 4; index += 1) {
    const candidate = candidates[index]
    prompt = prompt
      .replaceAll(`{candidate${index + 1}Id}`, candidate?.id || '')
      .replace(`{image${index + 1}Url}`, candidate?.url || '')
  }
  return prompt
}
