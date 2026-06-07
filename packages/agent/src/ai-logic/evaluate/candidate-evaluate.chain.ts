import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { safeJsonParse } from '../../common'
import { CANDIDATE_EVALUATE_PROMPT } from '../prompts/candidate-evaluate-prompt'
import type { CandidateImage } from '../../generate/generate-types'
import type { CandidateEvaluationBatch } from './evaluate-types'

export async function evaluateCandidates(
  candidates: CandidateImage[],
  constraintSummary: string,
): Promise<CandidateEvaluationBatch> {
  const llm = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
    temperature: 0.1,
  })

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
  const raw =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content)

  return safeJsonParse<CandidateEvaluationBatch>(raw, {
    evaluations: [],
    bestCandidateId: '',
    summary: '评分失败',
  })!
}
