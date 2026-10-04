/**
 * 全局业务异常类
 */
export class BusinessError extends Error {
  constructor(
    message: string,
    public code = 500,
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

/**
 * 全局异常兜底
 */
export function handleGlobalError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return '未知系统异常'
}
