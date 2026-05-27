import { ConversationMemoryData, MemoryOperationInput } from './memory-types'

// 内存存储的对话记忆（生产可替换为Redis/数据库）
const memoryStore = new Map<string, ConversationMemoryData>()

// 创建对话记忆管理器
export class ConversationMemory {
  // 获取会话记忆
  getMemory(input: MemoryOperationInput): ConversationMemoryData {
    return (
      memoryStore.get(input.sessionId) || {
        sessionId: input.sessionId,
        chatHistory: [],
        brandContext: input.brandContext,
      }
    )
  }

  // 添加消息到记忆
  addMessage(input: MemoryOperationInput): void {
    if (!input.message) return
    const memory = this.getMemory(input)
    memory.chatHistory.push(input.message)
    memoryStore.set(input.sessionId, memory)
  }

  // 清空会话记忆
  clearMemory(sessionId: string): void {
    memoryStore.delete(sessionId)
  }

  // 获取格式化的对话历史（供AI使用）
  getFormattedHistory(sessionId: string): string {
    const memory = this.getMemory({ sessionId })
    return memory.chatHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')
  }
}

// 单例导出（全局复用）
export const conversationMemory = new ConversationMemory()
