import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { safeJsonParse } from '../../common'
import { FINAL_EVALUATE_PROMPT } from '../prompts/final-evaluate-prompt'
import type { FinalEvaluationResult } from './evaluate-types'

export async function runFinalEvaluation(
  imageUrl: string,
  constraintSummary: string,
): Promise<FinalEvaluationResult> {
  const llm = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
    temperature: 0.1,
  })

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
  const raw =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content)

  return safeJsonParse<FinalEvaluationResult>(raw, {
    overallScore: 0,
    passed: false,
    dimensionScores: {
      brandCompliance: 0,
      aestheticQuality: 0,
      technicalQuality: 0,
      compositionQuality: 0,
    },
    deductions: [],
    suggestions: ['质检异常，请重试'],
    canExport: false,
  })!
}
