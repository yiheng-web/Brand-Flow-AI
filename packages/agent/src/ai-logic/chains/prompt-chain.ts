import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { PROMPT_GENERATE_TEMPLATE } from '../prompts/prompt-expert'
import type { IntentType } from './intent-chain'
import { safeJsonParse } from '../../common'
import { asRunnableLlm } from '../../common/langchain-utils'
import { createOpenAIChatModel } from '../../common/openai-config'

export interface PromptChainInput {
  userQuery: string
  intent: IntentType
  brandGuidelines: string
  context?: string
}

export interface PromptChainOutput {
  systemPrompt: string
  userPrompt: string
  finalPrompt: string
  negativePrompt?: string
  purpose: string
}

export function createPromptChain() {
  const llm = createOpenAIChatModel()

  const promptTemplate = PromptTemplate.fromTemplate(PROMPT_GENERATE_TEMPLATE)

  return RunnableSequence.from([
    (input: PromptChainInput) => ({
      userQuery: input.userQuery,
      intent: input.intent,
      brandGuidelines: input.brandGuidelines,
      context: input.context || '无上下文',
    }),
    promptTemplate,
    asRunnableLlm(llm),
    new StringOutputParser(),
    (rawOutput: string): PromptChainOutput => {
      return safeJsonParse<PromptChainOutput>(rawOutput, {
        systemPrompt: '生成失败',
        userPrompt: '生成失败',
        finalPrompt: '生成失败',
        negativePrompt: '',
        purpose: '解析异常',
      })!
    },
  ])
}
