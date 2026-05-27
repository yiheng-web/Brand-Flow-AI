/**
 * 简易日志工具（生产环境静默 info，warn/error 始终输出）
 */
export const logger = {
  info: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[INFO]', ...args)
    }
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args)
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args)
  },
}
