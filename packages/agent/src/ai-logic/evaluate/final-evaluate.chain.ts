import { HumanMessage } from '@langchain/core/messages'
import { safeJsonParse } from '../../common'
import { createOpenAIChatModel, extractOpenAIText } from '../../common/openai-config'
import { FINAL_EVALUATE_PROMPT } from '../prompts/final-evaluate-prompt'
import type { FinalEvaluationResult } from './evaluate-types'

export async function runFinalEvaluation(
  imageUrl: string,
  constraintSummary: string,
): Promise<FinalEvaluationResult> {
  const llm = createOpenAIChatModel()

  const message = new HumanMessage({
    content: [
      {
        type: 'text',
        text: FINAL_EVALUATE_PROMPT.replace('{constraintSummary}', constraintSummary).replace(
          '{imageUrl}',
          imageUrl,
        ),
      },
      { type: 'image_url' as const, image_url: { url: imageUrl } },
    ],
  })

  const response = await llm.invoke([message])
  const raw = extractOpenAIText(response.content)

  const parsed = safeJsonParse<FinalEvaluationResult>(raw)
  if (!parsed) throw new Error('最终质检 Provider 返回了无法解析的结果')
  return parsed
}
