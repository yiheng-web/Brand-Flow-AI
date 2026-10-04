import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthEventSource } from './sse'

const auth = vi.hoisted(() => ({
  getState: () => ({ user: { id: 'user-a' }, token: 'test-token', isLoggedIn: true }),
  subscribe: vi.fn(() => vi.fn()),
}))
vi.mock('../store/useAuthStore', () => ({ useAuthStore: auth }))

const snapshot = (sequence: number, status = 'running') => ({
  type: 'workflow_snapshot',
  timestamp: '2026-10-04T00:00:00Z',
  workflowId: 'wf-a',
  sequence,
  snapshot: { workflow: { id: 'wf-a', status, eventSequence: sequence }, nodes: [] },
})
const response = (...events: unknown[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
          ),
        )
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )

describe('SSE 恢复', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('EOF 后读取快照并带游标重连，重复事件无副作用，终态释放连接', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(snapshot(1)))
      .mockResolvedValueOnce(response(snapshot(1), snapshot(2, 'cancelled')))
    vi.stubGlobal('fetch', fetch)
    const onMessage = vi.fn()
    const beforeReconnect = vi.fn().mockResolvedValue(undefined)
    const source = createAuthEventSource('/workflows/wf-a/stream', { onMessage, beforeReconnect })
    await vi.advanceTimersByTimeAsync(0)
    expect(onMessage).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(beforeReconnect).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[1][1].headers['Last-Event-ID']).toBe('1')
    expect(onMessage).toHaveBeenCalledTimes(2)
    expect(onMessage.mock.calls[1][0].snapshot.workflow.status).toBe('cancelled')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledTimes(2)
    source.close()
  })
  it('无心跳超时后中止连接并重连；主动关闭清除重试', async () => {
    const fetch = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('timeout')), {
            once: true,
          })
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const onError = vi.fn()
    const source = createAuthEventSource('/stream', { onError })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(onError).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetch).toHaveBeenCalledTimes(2)
    source.close()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('鉴权失败报告错误且不反复重连', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetch)
    const onError = vi.fn()
    const source = createAuthEventSource('/stream', { onError })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    source.close()
  })
})
