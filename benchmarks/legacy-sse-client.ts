import type { WorkflowSseEvent } from '@brand-flow/contracts'
import { parseWorkflowSseEvent } from '@brand-flow/contracts'

interface LegacySseOptions {
  onMessage?: (event: WorkflowSseEvent) => void
  onError?: (error: unknown) => void
}

/**
 * 修复前 `createAuthEventSource` 的解析快照，仅用于复现 Before 数据。
 */
export function createLegacyEventSource(
  url: string,
  options?: LegacySseOptions,
): { close: () => void } {
  const controller = new AbortController()
  let closed = false

  const connect = async () => {
    try {
      const response = await fetch(url, { signal: controller.signal })
      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''
      while (!closed) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        let eventType = ''
        let eventData = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          else if (line.startsWith('data: ')) eventData = line.slice(6)
          else if (line === '' && eventData) {
            try {
              const parsed = JSON.parse(eventData) as Record<string, unknown>
              const event = parseWorkflowSseEvent({
                ...parsed,
                type: eventType || parsed.type,
              })
              if (event) options?.onMessage?.(event)
            } catch {
              // 修复前实现会静默忽略畸形事件。
            }
            eventType = ''
            eventData = ''
          }
        }
      }
    } catch (error: unknown) {
      if (!closed && (!(error instanceof Error) || error.name !== 'AbortError')) {
        options?.onError?.(error)
      }
    }
  }

  void connect()
  return {
    close: () => {
      closed = true
      controller.abort()
    },
  }
}
