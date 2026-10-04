/**
 * 业务错误码定义
 */
export const ERROR_CODE = {
  SUCCESS: 0,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 502,
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/**
 * 错误码对应的默认消息
 */
export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  [ERROR_CODE.SUCCESS]: '成功',
  [ERROR_CODE.BAD_REQUEST]: '请求参数错误',
  [ERROR_CODE.UNAUTHORIZED]: '身份验证失败',
  [ERROR_CODE.FORBIDDEN]: '权限不足，拒绝访问',
  [ERROR_CODE.NOT_FOUND]: '请求的资源不存在',
  [ERROR_CODE.INTERNAL_SERVER_ERROR]: '服务器内部错误',
  [ERROR_CODE.SERVICE_UNAVAILABLE]: '服务不可用，请稍后再试',
}

/**
 * 统一响应接口格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  statusCode: number
  errorCode?: number
  data: T
  message: string
  path?: string
  timestamp?: string
}
