/**
 * 安全解析JSON（防止崩溃，通用工具）
 */
export function safeJsonParse<T = unknown>(text: string, defaultValue: T | null = null): T | null {
  const parse = (candidate: string): T | null => {
    try {
      return JSON.parse(candidate) as T
    } catch {
      return null
    }
  }

  try {
    let cleaned = text.trim()
    // 去除 markdown 代码块包裹
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '') // 开头 ```
    cleaned = cleaned.replace(/\n?\s*```$/i, '') // 结尾 ```
    cleaned = cleaned.trim()
    const direct = parse(cleaned)
    if (direct !== null) return direct

    // 兼容部分模型在 JSON 前后附加简短说明，但仍只接受完整、配对的 JSON 对象或数组。
    for (let start = 0; start < cleaned.length; start += 1) {
      const opening = cleaned[start]
      if (opening !== '{' && opening !== '[') continue
      const closing = opening === '{' ? '}' : ']'
      let depth = 0
      let inString = false
      let escaped = false
      for (let end = start; end < cleaned.length; end += 1) {
        const character = cleaned[end]
        if (inString) {
          if (escaped) escaped = false
          else if (character === '\\') escaped = true
          else if (character === '"') inString = false
          continue
        }
        if (character === '"') {
          inString = true
          continue
        }
        if (character === opening) depth += 1
        else if (character === closing) depth -= 1
        if (depth !== 0) continue
        const parsed = parse(cleaned.slice(start, end + 1))
        if (parsed !== null) return parsed
        break
      }
    }
    return defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * 格式化字符串，去除空行/空格
 */
export function trimText(text: string): string {
  return text.trim().replace(/\n\s*\n/g, '\n')
}

/**
 * 判断是否为空值
 */
export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/**
 * 生成随机会话ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
