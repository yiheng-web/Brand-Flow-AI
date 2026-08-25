import { describe, expect, it } from 'vitest'

import { createWorkflowSseParser } from './sse'

const event = {
  type: 'node_completed',
  workflowId: 'wf-1',
  nodeId: 'node-1',
  nodeType: 'generate',
  output: { content: '中文内容' },
  timestamp: '2026-08-24T00:00:00.000Z',
}

describe('createWorkflowSseParser', () => {
  it('跨 chunk 保留 event 和 data 状态', () => {
    const parser = createWorkflowSseParser()
    const payload = `event: node_completed\ndata: ${JSON.stringify(event)}\n\n`
    const first = parser.push(payload.slice(0, 31))
    const second = parser.push(payload.slice(31))

    expect(first).toHaveLength(0)
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject(event)
  })

  it('在 EOF 冲刷没有尾部换行的最后事件', () => {
    const parser = createWorkflowSseParser()
    parser.push(`event: node_completed\ndata: ${JSON.stringify(event)}`)

    expect(parser.finish()).toHaveLength(1)
  })

  it('忽略畸形 JSON 并继续解析后续事件', () => {
    const parser = createWorkflowSseParser()
    const events = parser.push(
      `event: node_completed\ndata: {BROKEN}\n\nevent: node_completed\ndata: ${JSON.stringify(event)}\n\n`,
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject(event)
  })
})
