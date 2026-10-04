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
  cursor?: number
  beforeReconnect?: () => Promise<void>
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
  let controller: AbortController | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let wakeRetry: (() => void) | undefined
  let closed = false
  let sequence = options?.cursor ?? -1
  const sessionUserId = useAuthStore.getState().user?.id
  const close = () => {
    closed = true
    controller?.abort()
    clearTimeout(retryTimer)
    wakeRetry?.()
    unsubscribe()
  }
  const unsubscribe = useAuthStore.subscribe((state) => {
    if (!state.isLoggedIn || state.user?.id !== sessionUserId) close()
  })

  const connect = async () => {
    let attempts = 0
    while (!closed) {
      controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout> | undefined
      const refreshTimeout = () => {
        clearTimeout(timeout)
        timeout = setTimeout(() => controller?.abort(), 30_000)
      }
      try {
        if (attempts > 0) await options?.beforeReconnect?.()
        if (closed) break
        const token = useAuthStore.getState().token
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
        if (sequence >= 0) headers['Last-Event-ID'] = String(sequence)

        refreshTimeout()

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        })

        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            options?.onError?.(new Error(`SSE connection failed: ${response.status}`))
            close()
            break
          }
          throw new Error(`SSE connection failed: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('SSE response has no stream')

        const decoder = new TextDecoder()
        const parser = createWorkflowSseParser()
        const dispatch = (event: StreamEvent) => {
          if (event.type === 'heartbeat') return
          if (event.type === 'workflow_snapshot') {
            if (event.sequence <= sequence) return
            sequence = event.sequence
          }
          options?.onMessage?.(event)
          if (
            event.type === 'workflow_snapshot' &&
            ['completed', 'failed', 'cancelled'].includes(event.snapshot.workflow.status)
          )
            close()
        }

        while (!closed) {
          const { done, value } = await reader.read()
          if (closed) break
          if (done) {
            for (const event of parser.finish(decoder.decode())) dispatch(event)
            break
          }

          refreshTimeout()
          attempts = 0
          for (const event of parser.push(decoder.decode(value, { stream: true }))) dispatch(event)
        }
        if (!closed) options?.onError?.(new Error('SSE stream ended; reconnecting'))
      } catch (err: unknown) {
        if (!closed) options?.onError?.(err)
      } finally {
        clearTimeout(timeout)
        controller.abort()
      }
      if (closed) break
      attempts += 1
      await new Promise<void>((resolve) => {
        wakeRetry = resolve
        retryTimer = setTimeout(resolve, Math.min(1000 * 2 ** (attempts - 1), 10_000))
      })
    }
    close()
  }

  connect()

  return { close }
}
