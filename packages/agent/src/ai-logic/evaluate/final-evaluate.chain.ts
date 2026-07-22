import { HumanMessage } from '@langchain/core/messages'
import { safeJsonParse } from '../../common'
import {
  createSiliconFlowChatModel,
  extractChatText,
  prepareSiliconFlowVisionImage,
  SILICONFLOW_JSON_CALL_OPTIONS,
} from '../../common/siliconflow-chat'
import { FINAL_EVALUATE_PROMPT } from '../prompts/final-evaluate-prompt'
import type { FinalEvaluationResult } from './evaluate-types'

export async function runFinalEvaluation(
  imageUrl: string,
  constraintSummary: string,
): Promise<FinalEvaluationResult> {
  const llm = createSiliconFlowChatModel()
  const preparedImageUrl = await prepareSiliconFlowVisionImage(imageUrl)

  const message = new HumanMessage({
    content: [
      {
        type: 'text',
        text: FINAL_EVALUATE_PROMPT.replace('{constraintSummary}', constraintSummary).replace(
          '{imageUrl}',
          imageUrl,
        ),
      },
      { type: 'image_url' as const, image_url: { url: preparedImageUrl } },
    ],
  })

  const response = await llm.invoke([message], SILICONFLOW_JSON_CALL_OPTIONS)
  const raw = extractChatText(response.content)

  const parsed = safeJsonParse<FinalEvaluationResult>(raw)
  if (!parsed) throw new Error('最终质检 Provider 返回了无法解析的结果')
  return parsed
}
