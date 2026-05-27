import { ChatOpenAI } from '@langchain/openai'
import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { EVALUATION_PROMPT } from '../prompts/evaluate-prompt'
import type { EvaluationInput, EvaluationResult } from './evaluate-types'
import { safeJsonParse } from '../../common'
import { asRunnableLlm } from '../../common/langchain-utils'

// 创建评估链
export function createPromptEvaluationChain() {
  const llm = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL_NAME || 'deepseek-ai/DeepSeek-V3',
    temperature: 0.1,
  })

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
