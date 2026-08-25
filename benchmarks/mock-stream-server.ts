import { createServer, type Server, type ServerResponse } from 'node:http'
import { once } from 'node:events'

import { createCompletedEvent, createNodeEvent, encodeSse } from './fixtures'

interface BoundaryCase {
  chunks: Buffer[]
  expectedEvents: number
  expectedChineseContent?: string
}

const writeChunk = (response: ServerResponse, chunk: Buffer, delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(() => {
      if (!response.destroyed) response.write(chunk)
      resolve()
    }, delayMs)
  })

const splitBuffer = (source: Buffer, offsets: number[]): Buffer[] => {
  const chunks: Buffer[] = []
  let start = 0
  for (const offset of offsets) {
    chunks.push(source.subarray(start, offset))
    start = offset
  }
  chunks.push(source.subarray(start))
  return chunks.filter((chunk) => chunk.length > 0)
}

const boundaryCases = (): Record<string, BoundaryCase> => {
  const splitJson = Buffer.from(encodeSse(createNodeEvent(1)), 'utf8')
  const merged = Buffer.from(
    `${encodeSse(createNodeEvent(2, 'node_started'))}${encodeSse(createNodeEvent(3))}`,
    'utf8',
  )
  const chineseText = '中文跨分片仍应完整'
  const chineseEvent = createNodeEvent(4)
  if (chineseEvent.type !== 'node_completed') throw new Error('Fixture 类型错误')
  chineseEvent.output = { content: chineseText }
  const chinese = Buffer.from(encodeSse(chineseEvent), 'utf8')
  const chineseNeedle = Buffer.from('中', 'utf8')
  const chineseStart = chinese.indexOf(chineseNeedle)
  const eof = Buffer.from(encodeSse(createCompletedEvent(5)).replace(/\n\n$/, ''), 'utf8')
  const emptyLines = Buffer.from(`\n\n${encodeSse(createNodeEvent(6))}\n\n`, 'utf8')
  const malformed = Buffer.from(
    `event: node_completed\ndata: {"type":"node_completed",BROKEN}\n\n`,
    'utf8',
  )

  return {
    'split-json': {
      chunks: splitBuffer(splitJson, [9, 23, 47, splitJson.length - 1]),
      expectedEvents: 1,
    },
    'merged-events': { chunks: [merged], expectedEvents: 2 },
    'utf8-split': {
      chunks: splitBuffer(chinese, [chineseStart + 1, chineseStart + 2]),
      expectedEvents: 1,
      expectedChineseContent: chineseText,
    },
    'eof-no-newline': { chunks: [eof], expectedEvents: 1 },
    'empty-lines': { chunks: [emptyLines], expectedEvents: 1 },
    malformed: { chunks: [malformed], expectedEvents: 0 },
  }
}

export interface MockStreamServer {
  baseUrl: string
  boundaryCases: Record<string, Omit<BoundaryCase, 'chunks'>>
  close: () => Promise<void>
}

export async function startMockStreamServer(): Promise<MockStreamServer> {
  const cases = boundaryCases()
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    if (url.pathname === '/stream/ttfc') {
      const durationMs = Number(url.searchParams.get('durationMs') ?? 4000)
      const firstContentMs = Number(url.searchParams.get('firstContentMs') ?? 500)
      const sequence = Number(url.searchParams.get('sequence') ?? 0)
      setTimeout(() => {
        if (!response.destroyed) response.write(encodeSse(createNodeEvent(sequence)))
      }, firstContentMs)
      setTimeout(() => {
        if (!response.destroyed) {
          response.write(encodeSse(createCompletedEvent(sequence)))
          response.end()
        }
      }, durationMs)
      return
    }

    if (url.pathname.startsWith('/stream/boundary/')) {
      const name = url.pathname.split('/').at(-1) ?? ''
      const selected = cases[name]
      if (!selected) {
        response.statusCode = 404
        response.end()
        return
      }
      for (const [index, chunk] of selected.chunks.entries()) {
        await writeChunk(response, chunk, index === 0 ? 1 : 2)
      }
      response.end()
      return
    }

    if (url.pathname === '/stream/late-events') {
      const sequence = Number(url.searchParams.get('sequence') ?? 0)
      response.write(
        encodeSse({
          type: 'workflow_started',
          workflowId: `benchmark-stop-${sequence}`,
          timestamp: '2026-08-24T00:00:00.000Z',
        }),
      )
      for (let index = 0; index < 6; index += 1) {
        setTimeout(
          () => {
            if (!response.destroyed)
              response.write(encodeSse(createNodeEvent(sequence * 10 + index)))
          },
          30 + index * 5,
        )
      }
      setTimeout(() => {
        if (!response.destroyed) {
          response.write(encodeSse(createCompletedEvent(sequence)))
          response.end()
        }
      }, 65)
      return
    }

    response.statusCode = 404
    response.end()
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('无法获取 Mock Server 端口')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    boundaryCases: Object.fromEntries(
      Object.entries(cases).map(([name, value]) => [
        name,
        {
          expectedEvents: value.expectedEvents,
          expectedChineseContent: value.expectedChineseContent,
        },
      ]),
    ),
    close: async () => {
      server.close()
      await once(server, 'close')
    },
  }
}
