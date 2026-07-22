import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { INTENT_ANALYSIS_PROMPT } from '../prompts/intent-prompt'
import { safeJsonParse } from '../../common'
import { asRunnableLlm } from '../../common/langchain-utils'
import { createOpenAIChatModel } from '../../common/openai-config'

export type IntentType = '品牌描述' | '图片生成' | '风格调整' | '其他'

export interface IntentInput {
  userQuery: string
  context?: Record<string, any>
}

export interface IntentOutput {
  intent: IntentType
  confidence: number
  reason: string
  suggestedAction: string
}

export function createIntentChain() {
  const llm = createOpenAIChatModel()
  const prompt = PromptTemplate.fromTemplate(INTENT_ANALYSIS_PROMPT)

  return RunnableSequence.from([
    (input: IntentInput) => ({
      userQuery: input.userQuery,
      context: JSON.stringify(input.context || {}),
    }),
    prompt,
    asRunnableLlm(llm),
    new StringOutputParser(),
    (output: string) => {
      return safeJsonParse<IntentOutput>(output, {
        intent: '其他',
        confidence: 0,
        reason: '解析失败',
        suggestedAction: '重新输入',
      })!
    },
  ])
}
