// 全局通用响应结构
export interface BaseResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

// 全局上下文类型
export interface BaseContext {
  sessionId?: string
  timestamp?: number
  [key: string]: unknown
}

// 空函数类型
export type VoidFunction = () => void
