import { HumanMessage } from '@langchain/core/messages'
import { safeJsonParse } from '../../common'
import { createOpenAIChatModel, extractOpenAIText } from '../../common/openai-config'
import { CANDIDATE_EVALUATE_PROMPT } from '../prompts/candidate-evaluate-prompt'
import type { CandidateImage } from '../../generate/generate-types'
import type { CandidateEvaluationBatch } from './evaluate-types'

export async function evaluateCandidates(
  candidates: CandidateImage[],
  constraintSummary: string,
): Promise<CandidateEvaluationBatch> {
  const llm = createOpenAIChatModel()

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
      ...candidates.map((c) => ({
        type: 'image_url' as const,
        image_url: { url: c.url },
      })),
    ],
  })

  const response = await llm.invoke([message])
  const raw = extractOpenAIText(response.content)

  const parsed = safeJsonParse<CandidateEvaluationBatch>(raw)
  if (!parsed) throw new Error('候选质检 Provider 返回了无法解析的结果')
  return parsed
}
