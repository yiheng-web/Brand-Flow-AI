/**
 * 支持自定义请求头的 EventSource 替代实现
 *
 * 标准 EventSource 不支持自定义 headers（无法传递 Authorization token），
 * 而 NestJS 的 @Sse() 装饰器需要 HTTP 请求才能工作。
 * 此工具类使用 fetch + ReadableStream 模拟 EventSource 的行为。
 */

import { useAuthStore } from '../store/useAuthStore'
import type { StreamEvent } from '../api/workflow'

type EventCallback = (event: StreamEvent) => void

interface SSEOptions {
  onMessage?: EventCallback
  onError?: (error: Event) => void
}

export function createAuthEventSource(
  url: string,
  options?: SSEOptions,
): { close: () => void } {
  const controller = new AbortController()
  let closed = false

  const connect = async () => {
    try {
      const token = useAuthStore.getState().token
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        options?.onError?.(new Error(`SSE connection failed: ${response.status}`) as any)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      while (!closed) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 格式（可能包含多条消息）
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 最后一段可能不完整

        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6)
          } else if (line === '' && eventData) {
            // 空行表示一个事件结束
            try {
              const parsed = JSON.parse(eventData)
              const event: StreamEvent = {
                type: (eventType || parsed.type) as StreamEvent['type'],
                ...parsed,
              }
              options?.onMessage?.(event)
            } catch {
              // 忽略解析失败
            }
            eventType = ''
            eventData = ''
          }
        }
      }
    } catch (err: any) {
      if (!closed && err.name !== 'AbortError') {
        options?.onError?.(err)
      }
    }
  }

  connect()

  return {
    close: () => {
      closed = true
      controller.abort()
    },
  }
}