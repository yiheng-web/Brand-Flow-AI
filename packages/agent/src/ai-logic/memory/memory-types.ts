// 对话消息类型
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

// 记忆上下文存储类型
export interface ConversationMemoryData {
  chatHistory: ChatMessage[]
  brandContext?: string
  sessionId: string
}

// 记忆操作输入
export interface MemoryOperationInput {
  sessionId: string
  message?: ChatMessage
  brandContext?: string
}
