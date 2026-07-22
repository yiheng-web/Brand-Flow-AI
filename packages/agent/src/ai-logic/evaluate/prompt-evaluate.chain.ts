import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { EVALUATION_PROMPT } from '../prompts/evaluate-prompt'
import type { EvaluationInput, EvaluationResult } from './evaluate-types'
import { safeJsonParse } from '../../common'
import { asRunnableLlm } from '../../common/langchain-utils'
import { createOpenAIChatModel } from '../../common/openai-config'

// 创建评估链
export function createPromptEvaluationChain() {
  const llm = createOpenAIChatModel()

  const prompt = PromptTemplate.fromTemplate(EVALUATION_PROMPT)

  return RunnableSequence.from<EvaluationInput, EvaluationResult>([
    (input) => ({
      userQuery: input.userQuery,
      intent: JSON.stringify(input.intentResult),
      prompt: JSON.stringify(input.promptResult),
      brandGuidelines: input.brandGuidelines || '无品牌规范',
    }),
    prompt,
    asRunnableLlm(llm),
    new StringOutputParser(),
    (rawOutput): EvaluationResult => {
      return safeJsonParse<EvaluationResult>(rawOutput, {
        overallScore: 1,
        intentEvaluation: { score: 1, comment: '评估失败' },
        promptEvaluation: { score: 1, comment: '评估失败' },
        complianceEvaluation: { score: 1, comment: '评估失败' },
        suggestions: ['评估异常，请重试'],
        status: 'failed',
      })!
    },
  ])
}
