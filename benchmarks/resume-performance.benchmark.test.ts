import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { parseWorkflowSseEvent, type WorkflowSseEvent } from '@brand-flow/contracts'
import { describe, expect, test } from 'vitest'

import { AssetsService } from '../apps/api/src/modules/assets/assets.service'
import { createAuthEventSource } from '../apps/web/src/utils/sse'
import { createContractDataset, expectedAcceptedContractEvents } from './fixtures'
import { createLegacyEventSource } from './legacy-sse-client'
import { startMockStreamServer } from './mock-stream-server'
import { calculateStatistics, percentageReduction } from './statistics'

const WARMUP_RUNS = 3
const MEASURED_RUNS = 20
const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const RESULT_DIR = path.join(ROOT_DIR, 'benchmark-results')
const PHASE = process.env.BENCHMARK_PHASE === 'before' ? 'before-fix' : 'after-fix'

interface SeededRandom {
  next: () => number
}

const createSeededRandom = (seed: number): SeededRandom => {
  let state = seed >>> 0
  return {
    next: () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 0x1_0000_0000
    },
  }
}

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

const currentClient = (
  url: string,
  options: {
    onMessage?: (event: WorkflowSseEvent) => void
    onError?: (error: unknown) => void
  },
) => createAuthEventSource(url, options)

type StreamClient = typeof currentClient

async function measureStreamingScenario(
  baseUrl: string,
  durationMs: number,
  firstContentBaseMs: number,
) {
  const random = createSeededRandom(20260824 + durationMs)
  const runs = Array.from({ length: WARMUP_RUNS + MEASURED_RUNS }, (_, sequence) => {
    const firstContentMs = Math.round(firstContentBaseMs - 80 + random.next() * 160)
    return new Promise<{ ttfcMs: number; completeMs: number }>((resolve, reject) => {
      const startedAt = performance.now()
      let ttfcMs: number | undefined
      let connection: { close: () => void } | undefined
      connection = currentClient(
        `${baseUrl}/stream/ttfc?durationMs=${durationMs}&firstContentMs=${firstContentMs}&sequence=${sequence}`,
        {
          onMessage: (event) => {
            if (ttfcMs === undefined) ttfcMs = performance.now() - startedAt
            if (event.type === 'workflow_completed') {
              const completeMs = performance.now() - startedAt
              connection?.close()
              resolve({ ttfcMs: ttfcMs ?? completeMs, completeMs })
            }
          },
          onError: reject,
        },
      )
    })
  })
  const completed = await Promise.all(runs)
  const samples = completed.slice(WARMUP_RUNS)
  const streaming = calculateStatistics(samples.map((sample) => sample.ttfcMs))
  const entireResponse = calculateStatistics(samples.map((sample) => sample.completeMs))
  return {
    durationMs,
    firstContentTargetMs: firstContentBaseMs,
    warmupRuns: WARMUP_RUNS,
    measuredRuns: MEASURED_RUNS,
    executionModel: `${WARMUP_RUNS + MEASURED_RUNS} 个本地并发连接，共享同一 Mock Server`,
    streamingTtfcMs: streaming,
    nonStreamingVisibleMs: entireResponse,
    medianWaitingReductionPercent: percentageReduction(entireResponse.median, streaming.median),
  }
}

async function runBoundaryCase(
  client: StreamClient,
  url: string,
): Promise<{ events: WorkflowSseEvent[]; errors: number }> {
  const events: WorkflowSseEvent[] = []
  let errors = 0
  const connection = client(url, {
    onMessage: (event) => events.push(event),
    onError: () => {
      errors += 1
    },
  })
  await wait(120)
  connection.close()
  return { events, errors }
}

async function measureBoundaryRobustness(
  baseUrl: string,
  cases: Record<string, { expectedEvents: number; expectedChineseContent?: string }>,
) {
  const results: Record<string, unknown> = {}
  for (const [name, expected] of Object.entries(cases)) {
    const legacy = await runBoundaryCase(
      createLegacyEventSource as StreamClient,
      `${baseUrl}/stream/boundary/${name}`,
    )
    const current = await runBoundaryCase(currentClient, `${baseUrl}/stream/boundary/${name}`)
    const currentOutput = current.events.find((event) => event.type === 'node_completed')
    const chineseContentMatches = expected.expectedChineseContent
      ? currentOutput?.type === 'node_completed' &&
        (currentOutput.output as { content?: string }).content === expected.expectedChineseContent
      : true
    results[name] = {
      expectedEvents: expected.expectedEvents,
      legacyEvents: legacy.events.length,
      currentEvents: current.events.length,
      legacyPass: legacy.events.length === expected.expectedEvents && legacy.errors === 0,
      currentPass:
        current.events.length === expected.expectedEvents &&
        current.errors === 0 &&
        chineseContentMatches,
      chineseContentMatches,
      legacyErrors: legacy.errors,
      currentErrors: current.errors,
    }
  }
  const values = Object.values(results) as Array<{
    legacyPass: boolean
    currentPass: boolean
  }>
  return {
    cases: results,
    legacyPassed: values.filter((result) => result.legacyPass).length,
    currentPassed: values.filter((result) => result.currentPass).length,
    totalCases: values.length,
  }
}

async function measureLateEventSuppression(baseUrl: string) {
  const random = createSeededRandom(424242)
  const results: Array<{
    connected: boolean
    lateEvents: number
    deliveredBeforeStop: number
  }> = []
  for (let sequence = 0; sequence < 100; sequence += 1) {
    const result = await new Promise<{
      connected: boolean
      lateEvents: number
      deliveredBeforeStop: number
    }>((resolve) => {
      let stopped = false
      let connected = false
      let lateEvents = 0
      let deliveredBeforeStop = 0
      let stopScheduled = false
      const stopAfterConnectedMs = 1 + Math.floor(random.next() * 15)
      const connection = currentClient(`${baseUrl}/stream/late-events?sequence=${sequence}`, {
        onMessage: () => {
          if (stopped) lateEvents += 1
          else {
            connected = true
            deliveredBeforeStop += 1
            if (!stopScheduled) {
              stopScheduled = true
              setTimeout(() => {
                stopped = true
                connection.close()
              }, stopAfterConnectedMs)
            }
          }
        },
      })
      setTimeout(() => {
        connection.close()
        resolve({ connected, lateEvents, deliveredBeforeStop })
      }, 90)
    })
    results.push(result)
  }
  const passed = results.filter((result) => result.connected && result.lateEvents === 0).length
  return {
    seededRandomStops: 100,
    connectionsEstablished: results.filter((result) => result.connected).length,
    successfulSuppressions: passed,
    successRatePercent: passed,
    lateEventsAfterStop: results.reduce((sum, result) => sum + result.lateEvents, 0),
    deliveredBeforeStop: results.reduce((sum, result) => sum + result.deliveredBeforeStop, 0),
  }
}

function measureContractParser(size: number) {
  const dataset = createContractDataset(size)
  const repeatsPerSample = Math.max(1, Math.ceil(1000 / size))
  const samples: number[] = []
  const acceptedCounts: number[] = []
  for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run += 1) {
    let accepted = 0
    const startedAt = performance.now()
    for (let repeat = 0; repeat < repeatsPerSample; repeat += 1) {
      for (const event of dataset) {
        if (parseWorkflowSseEvent(event)) accepted += 1
      }
    }
    const elapsed = performance.now() - startedAt
    if (run >= WARMUP_RUNS) {
      samples.push(elapsed)
      acceptedCounts.push(accepted)
    }
  }
  const expectedAccepted = expectedAcceptedContractEvents(size) * repeatsPerSample
  return {
    datasetSize: size,
    repeatsPerSample,
    eventsPerSample: size * repeatsPerSample,
    warmupRuns: WARMUP_RUNS,
    measuredRuns: MEASURED_RUNS,
    totalTimeMs: calculateStatistics(samples),
    medianMicrosecondsPerEvent: Number(
      ((calculateStatistics(samples).median * 1000) / (size * repeatsPerSample)).toFixed(4),
    ),
    expectedAccepted,
    observedAccepted: acceptedCounts[0],
    invalidEventsRejected: acceptedCounts.every((count) => count === expectedAccepted),
  }
}

const createLatencySchedule = (count: number, seed: number): Map<string, number> => {
  const random = createSeededRandom(seed)
  return new Map(
    Array.from({ length: count }, (_, index) => [
      `assets/benchmark-${index}.png`,
      Math.round(50 - 10 + random.next() * 20),
    ]),
  )
}

const delaySignedUrl = async (key: string, schedule: Map<string, number>): Promise<string> => {
  await wait(schedule.get(key) ?? 50)
  return `https://local.invalid/${key}?signature=benchmark`
}

const createAssets = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const objectKey = `assets/benchmark-${index}.png`
    return {
      objectKey,
      toObject: () => ({ id: `asset-${index}`, objectKey }),
    }
  })

async function runSerial(count: number, schedule: Map<string, number>): Promise<void> {
  for (const asset of createAssets(count)) {
    await delaySignedUrl(asset.objectKey, schedule)
  }
}

async function runPool(count: number, schedule: Map<string, number>, limit: number): Promise<void> {
  const assets = createAssets(count)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, count) }, async () => {
      while (cursor < assets.length) {
        const current = assets[cursor]
        cursor += 1
        await delaySignedUrl(current.objectKey, schedule)
      }
    }),
  )
}

async function runCurrentAssetsService(
  count: number,
  schedule: Map<string, number>,
): Promise<void> {
  const assets = createAssets(count)
  const assetModel = {
    find: () => ({ sort: async () => assets }),
  }
  const storageService = {
    getSignedUrl: (key: string) => delaySignedUrl(key, schedule),
  }
  const service = new AssetsService(
    assetModel as never,
    {} as never,
    storageService as never,
    {} as never,
  )
  await service.getAssets('507f1f77bcf86cd799439011', undefined, 'personal')
}

async function measureAssetConcurrency(count: number) {
  const serialSamples: number[] = []
  const currentSamples: number[] = []
  const poolSamples: number[] = []
  for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run += 1) {
    const schedule = createLatencySchedule(count, 7000 + count * 100 + run)
    let startedAt = performance.now()
    await runSerial(count, schedule)
    const serial = performance.now() - startedAt
    startedAt = performance.now()
    await runCurrentAssetsService(count, schedule)
    const current = performance.now() - startedAt
    startedAt = performance.now()
    await runPool(count, schedule, 5)
    const pool = performance.now() - startedAt
    if (run >= WARMUP_RUNS) {
      serialSamples.push(serial)
      currentSamples.push(current)
      poolSamples.push(pool)
    }
  }
  const serial = calculateStatistics(serialSamples)
  const current = calculateStatistics(currentSamples)
  const pool = calculateStatistics(poolSamples)
  return {
    requestCount: count,
    mockLatency: '50ms ± 10ms，固定 seed',
    warmupRuns: WARMUP_RUNS,
    measuredRuns: MEASURED_RUNS,
    serialMs: serial,
    currentPromiseAllMs: current,
    limit5PoolMs: pool,
    currentMedianReductionPercent: percentageReduction(serial.median, current.median),
    poolMedianReductionPercent: percentageReduction(serial.median, pool.median),
  }
}

const environment = () => ({
  capturedAt: new Date().toISOString(),
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  logicalCpuCount: os.cpus().length,
  ramGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
  node: process.version,
  packageManager: 'pnpm@10.29.3',
  browser: '未使用浏览器；SSE 使用 Node 22 fetch/ReadableStream',
  benchmarkCommitHash: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim(),
  worktreeDirty:
    execFileSync('git', ['status', '--porcelain'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    }).trim().length > 0,
})

describe('Resume performance benchmark', () => {
  test('运行本地可复现 Benchmark 并写入原始结果', async () => {
    const server = await startMockStreamServer()
    try {
      const streaming = []
      for (const scenario of [
        { durationMs: 4000, firstContentMs: 400 },
        { durationMs: 8000, firstContentMs: 600 },
        { durationMs: 12000, firstContentMs: 750 },
      ]) {
        streaming.push(
          await measureStreamingScenario(
            server.baseUrl,
            scenario.durationMs,
            scenario.firstContentMs,
          ),
        )
      }

      const boundary = await measureBoundaryRobustness(server.baseUrl, server.boundaryCases)
      const lateEvents = await measureLateEventSuppression(server.baseUrl)
      const contractParser = [100, 1000, 10_000].map(measureContractParser)
      const assetConcurrency = []
      for (const count of [5, 10, 20]) {
        assetConcurrency.push(await measureAssetConcurrency(count))
      }

      const results = {
        schemaVersion: 1,
        phase: PHASE,
        environment: environment(),
        methodology: {
          warmupRuns: WARMUP_RUNS,
          measuredRuns: MEASURED_RUNS,
          percentile: 'nearest-rank p95',
          standardDeviation: 'population',
          randomization: 'LCG seeded random',
          externalServices: 'none',
        },
        benchmarks: {
          agentStreamingTtfc: streaming,
          sseBoundaryRobustness: boundary,
          stopLateEventSuppression: lateEvents,
          structuredEventParser: contractParser,
          signedUrlConcurrency: assetConcurrency,
        },
      }

      await mkdir(RESULT_DIR, { recursive: true })
      const fileName = PHASE === 'before-fix' ? 'raw-results.before-fix.json' : 'raw-results.json'
      await writeFile(
        path.join(RESULT_DIR, fileName),
        `${JSON.stringify(results, null, 2)}\n`,
        'utf8',
      )

      expect(streaming).toHaveLength(3)
      expect(assetConcurrency).toHaveLength(3)
      expect(lateEvents.seededRandomStops).toBe(100)
    } finally {
      await server.close()
    }
  })
})
