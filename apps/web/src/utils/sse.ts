/**
 * 支持自定义请求头的 EventSource 替代实现
 *
 * 标准 EventSource 不支持自定义 headers（无法传递 Authorization token），
 * 而 NestJS 的 @Sse() 装饰器需要 HTTP 请求才能工作。
 * 此工具类使用 fetch + ReadableStream 模拟 EventSource 的行为。
 */

import { useAuthStore } from '../store/useAuthStore'
import type { StreamEvent } from '../api/workflow'
import { parseWorkflowSseEvent } from '@brand-flow/contracts'

type EventCallback = (event: StreamEvent) => void

interface SSEOptions {
  onMessage?: EventCallback
  onError?: (error: unknown) => void
}

interface WorkflowSseParser {
  push: (text: string) => StreamEvent[]
  finish: (text?: string) => StreamEvent[]
}

/**
 * 按 SSE 行协议增量解析事件，解析状态必须跨网络 chunk 保留。
 */
export function createWorkflowSseParser(): WorkflowSseParser {
  let buffer = ''
  let eventType = ''
  let eventDataLines: string[] = []

  const dispatch = (): StreamEvent[] => {
    if (eventDataLines.length === 0) return []
    const eventData = eventDataLines.join('\n')
    eventDataLines = []
    try {
      const parsed = JSON.parse(eventData) as Record<string, unknown>
      const event = parseWorkflowSseEvent({ ...parsed, type: eventType || parsed.type })
      eventType = ''
      return event ? [event as StreamEvent] : []
    } catch {
      eventType = ''
      return []
    }
  }

  const consumeLine = (rawLine: string): StreamEvent[] => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') return dispatch()
    if (line.startsWith(':')) return []
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trimStart()
    } else if (line.startsWith('data:')) {
      const value = line.slice(5)
      eventDataLines.push(value.startsWith(' ') ? value.slice(1) : value)
    }
    return []
  }

  const push = (text: string): StreamEvent[] => {
    buffer += text
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    return lines.flatMap(consumeLine)
  }

  return {
    push,
    finish: (text = '') => {
      const events = push(text)
      if (buffer) {
        events.push(...consumeLine(buffer))
        buffer = ''
      }
      events.push(...dispatch())
      return events
    },
  }
}

export function createAuthEventSource(url: string, options?: SSEOptions): { close: () => void } {
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
        options?.onError?.(new Error(`SSE connection failed: ${response.status}`))
        return
      }

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      const parser = createWorkflowSseParser()

      while (!closed) {
        const { done, value } = await reader.read()
        if (done) {
          for (const event of parser.finish(decoder.decode())) options?.onMessage?.(event)
          break
        }

        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          options?.onMessage?.(event)
        }
      }
    } catch (err: unknown) {
      if (!closed && (!(err instanceof Error) || err.name !== 'AbortError')) {
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
