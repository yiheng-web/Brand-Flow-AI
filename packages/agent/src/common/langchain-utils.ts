import type { Runnable } from '@langchain/core/runnables'
import type { ChatOpenAI } from '@langchain/openai'

/** 避免 monorepo 内多份 @langchain/core 时 ChatOpenAI 与 Runnable 类型不兼容 */
export function asRunnableLlm(llm: ChatOpenAI): Runnable {
  return llm as unknown as Runnable
}
