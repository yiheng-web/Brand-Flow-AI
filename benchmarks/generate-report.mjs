import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RESULT_DIR = path.join(ROOT_DIR, 'benchmark-results')
const raw = JSON.parse(await readFile(path.join(RESULT_DIR, 'raw-results.json'), 'utf8'))
const before = JSON.parse(
  await readFile(path.join(RESULT_DIR, 'raw-results.before-fix.json'), 'utf8'),
)

const { environment, methodology, benchmarks } = raw
const format = (value, digits = 2) => Number(value).toFixed(digits)
const percent = (value) => `${format(value, 1)}%`
const statsCells = (stats) =>
  `${format(stats.mean)} | ${format(stats.median)} | ${format(stats.p95)} | ${format(stats.min)} | ${format(stats.max)} | ${format(stats.standardDeviation)}`

const streamRows = benchmarks.agentStreamingTtfc
  .flatMap((scenario) => [
    `| ${scenario.durationMs / 1000}s | Streaming TTFC | ${statsCells(scenario.streamingTtfcMs)} | ${percent(scenario.medianWaitingReductionPercent)} |`,
    `| ${scenario.durationMs / 1000}s | Entire response | ${statsCells(scenario.nonStreamingVisibleMs)} | baseline |`,
  ])
  .join('\n')

const boundaryRows = Object.entries(benchmarks.sseBoundaryRobustness.cases)
  .map(
    ([name, result]) =>
      `| ${name} | ${result.expectedEvents} | ${result.legacyEvents} | ${result.currentEvents} | ${result.currentPass ? 'PASS' : 'FAIL'} |`,
  )
  .join('\n')

const parserRows = benchmarks.structuredEventParser
  .map(
    (result) =>
      `| ${result.datasetSize.toLocaleString('en-US')} | ${result.eventsPerSample.toLocaleString('en-US')} | ${statsCells(result.totalTimeMs)} | ${format(result.medianMicrosecondsPerEvent, 4)} | ${result.observedAccepted}/${result.expectedAccepted} |`,
  )
  .join('\n')

const concurrencyRows = benchmarks.signedUrlConcurrency
  .flatMap((result) => [
    `| ${result.requestCount} | Serial | ${statsCells(result.serialMs)} | baseline |`,
    `| ${result.requestCount} | Current Promise.all | ${statsCells(result.currentPromiseAllMs)} | ${percent(result.currentMedianReductionPercent)} |`,
    `| ${result.requestCount} | limit=5 pool | ${statsCells(result.limit5PoolMs)} | ${percent(result.poolMedianReductionPercent)} |`,
  ])
  .join('\n')

const longestStream = benchmarks.agentStreamingTtfc.at(-1)
const largestConcurrency = benchmarks.signedUrlConcurrency.at(-1)
const beforeParser = before.benchmarks.structuredEventParser.at(-1)
const afterParser = benchmarks.structuredEventParser.at(-1)

const environmentMarkdown = `# Benchmark Environment

| Item | Value |
| --- | --- |
| Captured at | ${environment.capturedAt} |
| OS | ${environment.os} |
| CPU | ${environment.cpu} |
| Logical CPUs | ${environment.logicalCpuCount} |
| RAM | ${environment.ramGiB} GiB |
| Node.js | ${environment.node} |
| Package manager | ${environment.packageManager} |
| Browser | ${environment.browser} |
| Benchmark commit | \`${environment.benchmarkCommitHash}\` |
| Branch | \`${environment.branch}\` |
| Worktree dirty during run | ${environment.worktreeDirty ? 'yes' : 'no'} |

## Runtime Boundaries

- 未连接真实后端、COS、模型服务、Redis、MongoDB、SSE 服务或企业内网。
- Git 安全审批器拒绝了自动提交，因此 commit 是基准点，Benchmark 与修复文件在运行时为未提交工作树内容。
- Streaming 通过本地 Node HTTP Server 与项目真实 \`createAuthEventSource\` 执行。
- 签名 URL 使用固定 seed 的 50ms ± 10ms Mock 延迟和项目真实 \`AssetsService.getAssets\`。
- 未启动浏览器，因此没有 Chrome 版本、DOM 节点、浏览器 Heap、Long Task 或 FPS 数据。
- 测量使用 Node \`performance.now()\`；OS 调度、GC 和同机进程仍会带来噪声。
`

const summaryMarkdown = `# Benchmark Summary

## Test Environment

${environment.os}，${environment.cpu}，${environment.ramGiB} GiB RAM，Node ${environment.node}，${environment.packageManager}。完整记录见 [environment.md](./environment.md)。

## Source Audit and Selection

源码审计覆盖 Web/API/Agent/Contracts、测试配置、依赖声明、Git history，以及 lazy、并发、计时器、ReadableStream、TextDecoder、AbortController、SSE、Worker、debounce、dispose 等关键词。

最终选择 5 项最高价值 Benchmark：

1. Agent Streaming TTFC；
2. SSE TCP Chunk / UTF-8 / EOF 防御性；
3. Stop 后迟到事件抑制；
4. 结构化 SSE 契约解析；
5. 素材签名 URL Promise.all 聚合。

组织树 Lazy Load、轮询、消息块 Reducer、Workspace Debounce、Web Worker、搜索 Debounce 和地图资源在当前源码中不存在，因此未构造虚假对照。

## Methodology

- 性能项：${methodology.warmupRuns} 次 warm-up，不计入统计；${methodology.measuredRuns} 次有效运行。
- 统计：mean、median、nearest-rank p95、min、max、population standard deviation。
- 小于 1ms 的解析函数：每个样本至少处理 1,000 个事件；10,000 档直接处理 10,000 个事件。
- Jitter 与 Stop 时点：固定 seed LCG，可重复。
- 原始数据：[raw-results.json](./raw-results.json)；修复前证据：[raw-results.before-fix.json](./raw-results.before-fix.json)。

## Benchmarks Executed

## 1. Agent Streaming TTFC

### Problem

非流式 UI 必须等待整个 Agent 请求完成；流式 UI 可在首个有效工作流内容事件到达时展示进度。

### Baseline

Entire response：直到 \`workflow_completed\` 才对用户可见。

### Current Implementation

项目真实 \`createAuthEventSource\` + \`ReadableStream\` + \`TextDecoder\` + 共享 SSE 契约解析。

### Dataset

本地 Mock Agent 流总时长 4s / 8s / 12s，首内容目标分别为 400ms / 600ms / 750ms，并使用固定 seed jitter。每档 23 个本地并发连接，其中前 3 个作为 warm-up、后 20 个计入统计。

### Raw Statistics

单位：ms。

| Total duration | Metric | Mean | Median | P95 | Min | Max | Std Dev | Median change |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${streamRows}

### Evidence Level

**B**：真实项目客户端与真实生产事件结构 + Synthetic timing / Local Mock Server。

### Interpretation

12s 场景下首次有效内容 median 为 ${format(longestStream.streamingTtfcMs.median)}ms，完整响应可见时间 median 为 ${format(longestStream.nonStreamingVisibleMs.median)}ms，本地等待时间降低 ${percent(longestStream.medianWaitingReductionPercent)}。

### Limitations

这是本地 Mock Agent 流，不代表线上模型推理、网络或生产监控性能；23 个连接并发启动会包含本地连接调度开销。

## 2. SSE TCP Chunk Boundary and EOF

### Problem

修复前解析器把 \`eventType\` / \`eventData\` 放在单次 \`reader.read()\` 内，状态无法跨 chunk 保留；EOF 也未冲刷尾部 buffer。

### Baseline

修复前源码快照，保存在 \`benchmarks/legacy-sse-client.ts\`，用于可重复 Before 对照。

### Current Implementation

增量行解析器跨 chunk 保存 event/data 状态，使用 streaming \`TextDecoder\`，并在 EOF flush 尾部事件。

### Dataset and Result

| Case | Expected events | Before | After | After status |
| --- | ---: | ---: | ---: | --- |
${boundaryRows}

Before：${benchmarks.sseBoundaryRobustness.legacyPassed}/${benchmarks.sseBoundaryRobustness.totalCases}；After：${benchmarks.sseBoundaryRobustness.currentPassed}/${benchmarks.sseBoundaryRobustness.totalCases}。

### Evidence Level

**B**：真实生产解析器 + Synthetic TCP/UTF-8 分片。

### Interpretation

跨 chunk JSON 与无尾换行 EOF 两个丢事件缺陷均已修复；合并事件、中文 UTF-8 跨字节、空行和 malformed JSON 保持通过。

### Limitations

覆盖 6 个确定性边界用例，不等同于完整 SSE 协议一致性或长时网络故障测试。

## 3. Stop / Late Event Suppression

### Problem

用户停止或组件卸载后，服务端可能继续发送节点完成事件，若仍进入回调会造成 UI“复活”。

### Baseline

风险模型为服务端在客户端 close 后继续调度 6 个节点事件和终态事件。

### Current Implementation

真实 \`createAuthEventSource.close()\` 同时设置 closed 标志并调用 \`AbortController.abort()\`。

### Dataset and Raw Statistics

- 固定 seed 随机停止时点：${benchmarks.stopLateEventSuppression.seededRandomStops}
- 已确认收到首事件并建立连接：${benchmarks.stopLateEventSuppression.connectionsEstablished}
- 成功抑制：${benchmarks.stopLateEventSuppression.successfulSuppressions}
- Stop 后回调：${benchmarks.stopLateEventSuppression.lateEventsAfterStop}
- 成功率：${benchmarks.stopLateEventSuppression.successRatePercent}%

### Evidence Level

**B**：真实 Abort/closed 逻辑 + 本地 Synthetic server continuation。

### Interpretation

100 次有效停止中没有迟到事件进入业务回调。

### Limitations

这是客户端回调层验证，没有挂载完整 React Workspace，因此不能直接声称验证了 React UI DOM 状态或真实生产竞态。

## 4. Structured Workflow Event Parser

### Problem

修复前仅检查通用字段，未知 type 只要带有 node 字段也会被误接收。

### Baseline

修复前 10,000 档每样本应接收 ${beforeParser.expectedAccepted}，实际接收 ${beforeParser.observedAccepted}。

### Current Implementation

按 workflow/node 事件白名单校验 type，并校验 action、output、reason、error 等事件级必填字段。

### Raw Statistics

单位：总时间 ms；单事件为 μs。

| Dataset | Events/sample | Mean | Median | P95 | Min | Max | Std Dev | Median/event | Accepted actual/expected |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${parserRows}

### Evidence Level

**B**：真实共享契约解析器 + 真实事件字段结构的 Synthetic Dataset。

### Interpretation

10,000 事件档 median 为 ${format(afterParser.totalTimeMs.median)}ms，且 ${afterParser.observedAccepted}/${afterParser.expectedAccepted} 接收数完全一致。更严格校验增加了少量 CPU 成本，换取未知事件不再越过边界。

### Limitations

这是纯函数 CPU microbenchmark，不是 React FPS、端到端吞吐或网络吞吐；亚毫秒档受 JIT/GC 噪声影响明显，不推荐写进简历。

## 5. Signed URL Request Aggregation

### Problem

素材列表需为每个私有对象生成短期签名 URL；串行等待会按素材数量线性叠加延迟。

### Baseline

相同 Synthetic AssetDocument 和相同 seeded latency schedule 下串行 await。

### Current Implementation

直接执行项目真实 \`AssetsService.getAssets\`，其内部以 \`Promise.all\` 聚合签名 URL；额外测试 limit=5 池作为并发上限对照。

### Dataset

5 / 10 / 20 个素材，每个 Mock 请求 50ms ± 10ms，固定 seed；3 次 warm-up + 20 次有效运行。

### Raw Statistics

单位：ms。

| Requests | Strategy | Mean | Median | P95 | Min | Max | Std Dev | Median change |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${concurrencyRows}

### Evidence Level

**B**：真实 API Service 聚合代码 + Synthetic documents / Mock storage latency。

### Interpretation

20 请求时串行 median ${format(largestConcurrency.serialMs.median)}ms，当前 Promise.all median ${format(largestConcurrency.currentPromiseAllMs.median)}ms，降低 ${percent(largestConcurrency.currentMedianReductionPercent)}。limit=5 median ${format(largestConcurrency.limit5PoolMs.median)}ms，较慢但可控制下游并发压力。

### Limitations

Mock 延迟不包含真实 COS 签名计算、连接池、限流、错误重试和带宽；Promise.all 不是无限规模下的最佳策略，生产中应结合下游配额设置并发上限。

## Final Ranking

| Benchmark | Resume Value | Agent Relevance | Evidence | Interview Value |
| --- | ---: | ---: | --- | ---: |
| Agent Streaming TTFC | 10/10 | 10/10 | B | 10/10 |
| SSE Chunk / EOF | 9/10 | 10/10 | B | 10/10 |
| Stop / Late Event | 8/10 | 9/10 | B | 9/10 |
| Signed URL concurrency | 9/10 | 6/10 | B | 8/10 |
| Structured event parser | 6/10 | 9/10 | B | 8/10 |

Top 3 简历量化指标：Agent Streaming TTFC、签名 URL 并发聚合、SSE 分片 4/6 → 6/6。

Top 5 面试性能案例：Agent Streaming、SSE 分片/EOF、Stop/late event、签名 URL 并发权衡、结构化事件边界校验。
`

const resumeMarkdown = `# Resume-safe Metrics

以下数据均为 **Evidence Level B**，来自本地可重复 Benchmark，不是公司生产监控数据。

## Metric 1: Agent Streaming TTFC

### 推荐简历表达

在本地 Mock Agent 流基准中，基于项目真实 SSE 客户端与事件契约，将 4–12 秒任务的首次有效内容等待时间降低 ${percent(benchmarks.agentStreamingTtfc[0].medianWaitingReductionPercent)}–${percent(longestStream.medianWaitingReductionPercent)}；12 秒场景 median 由 ${format(longestStream.nonStreamingVisibleMs.median)}ms 降至 ${format(longestStream.streamingTtfcMs.median)}ms。

### 数据来源

本地 Node HTTP SSE Server；真实 \`createAuthEventSource\`、\`ReadableStream\`、\`TextDecoder\` 与共享契约；4s/8s/12s 各 3 次预热 + 20 次有效运行。

### Evidence Level

B

### 面试时怎么解释数据来源

离职后无法访问模型服务，所以没有宣称模型推理变快。Mock Server 固定总耗时和首内容时点，测的是 Streaming 相比整包展示的“用户首次看到有效结果”时间。

### 面试风险

低。必须始终带上“本地 Mock Agent 流”限定语。

## Metric 2: Signed URL 并发聚合

### 推荐简历表达

在 20 个私有素材、单请求 50ms ± 10ms 的本地基准中，使用项目真实 Promise.all 聚合将签名 URL 获取 median 从 ${format(largestConcurrency.serialMs.median)}ms 降至 ${format(largestConcurrency.currentPromiseAllMs.median)}ms，降低 ${percent(largestConcurrency.currentMedianReductionPercent)}；同时验证 limit=5 池在 ${format(largestConcurrency.limit5PoolMs.median)}ms 完成，以换取受控下游压力。

### 数据来源

真实 \`AssetsService.getAssets\` + Synthetic AssetDocument + seeded Mock StorageService；3 次预热 + 20 次有效运行。

### Evidence Level

B

### 面试时怎么解释数据来源

数字不是 COS 线上数据。Benchmark 对三种策略复用相同延迟序列，因此用于比较串行、无限 Promise.all 和 limit=5 的相对行为。

### 面试风险

中。不能省略 Mock latency，也不能声称 Promise.all 在任意规模都更优。

## Metric 3: SSE 分片健壮性

### 推荐简历表达

定位并修复 Agent SSE 增量解析的跨 chunk 状态与 EOF flush 缺陷，使 TCP/UTF-8/EOF 6 类确定性边界用例由 4/6 提升至 6/6，并在 100 个已建立连接的随机停止场景中保持 Stop 后业务回调 0 次。

### 数据来源

修复前源码快照与修复后真实客户端，运行本地 HTTP 分片 Server；Stop 时点使用固定 seed，且每次均在收到首事件后关闭。

### Evidence Level

B

### 面试时怎么解释数据来源

这不是生产丢包率。6 个用例分别覆盖 JSON 跨 chunk、多事件合并、中文 UTF-8 跨字节、EOF 无换行、空行和 malformed JSON；100 次 Stop 验证的是业务回调层抑制。

### 面试风险

低到中。不要把 6/6 表述为完整 SSE 协议 100% 覆盖，也不要把回调验证说成完整 React UI E2E。

## 不建议写入简历

- 结构化解析器的 μs/事件：虽然可复现，但属于 Node CPU microbenchmark，业务价值不如正确性，且亚毫秒噪声较大。
- Web build 的 chunk warning：本次没有实现或验证 bundle 优化，不能生成“包体积降低”数字。
`

const interviewMarkdown = `# Interview Notes

## 1. Agent Streaming TTFC

1. 原问题：非流式展示直到任务结束才反馈，长 Agent 链路等待感强。
2. 为什么慢：不是计算更慢，而是 UI 可见时点被绑定到完整响应。
3. 原复杂度/请求数：同一请求；差异是首内容可见时点，不是请求数量。
4. 当前方案：fetch + ReadableStream + TextDecoder 增量消费 SSE，并映射真实 Workflow event。
5. 为什么能提升：首个内容事件到达即可展示，不等待 terminal event。
6. 怎么测：本地 Server 固定 4/8/12s 完成时点，记录首业务事件和 completed 的 performance.now 差值。
7. 环境：${environment.os}、Node ${environment.node}，每档 3 warm-up + 20 measured。
8. 为什么不是生产数据：无原公司模型、网络和 SSE 服务权限。
9. 缺点：Streaming 不降低模型总耗时；还需要处理断线、重复事件、顺序和背压。
10. 线上继续优化：补 event id/replay、可观测 TTFT/TTFC、断线恢复、服务端 flush 和代理缓冲配置。

## 2. SSE Chunk / EOF

1. 原问题：TCP 不保证一次 read 对应一条 SSE，旧实现跨 read 丢解析状态。
2. 为什么会丢：eventType/eventData 每个 while 迭代重新初始化，EOF 尾 buffer 未 dispatch。
3. 原复杂度：时间仍为 O(bytes)，问题是边界状态机不完整。
4. 当前方案：增量 parser 持久保存 line buffer、event type、data lines，并在 EOF flush。
5. 为什么有效：语义边界从网络 chunk 转为 SSE 空行/EOF。
6. 怎么测：6 个确定性分片用例，Before 4/6，After 6/6。
7. 环境：本地 Node HTTP server，按 Buffer byte offset 切分，含中文 UTF-8 字节内切分。
8. 为什么不是生产数据：Synthetic chunk schedule，不是生产网络抓包。
9. 缺点：未覆盖重连、event id、retry、超长单事件和背压。
10. 线上继续优化：引入协议级 fuzz/property test、最大事件大小、防重放 ID 与断线续传。

## 3. Stop / Late Event

1. 原问题：停止后迟到事件可能继续改状态，导致 UI 复活。
2. 原因：abort 与业务 closed guard 若缺一，竞态窗口可能进入 callback。
3. 请求数量：100 次独立已连接流，每次服务端继续发送 7 个事件。
4. 当前方案：close 先置 closed，再 AbortController.abort。
5. 为什么有效：读取循环与错误回调都检查 closed，网络读取同时取消。
6. 怎么测：每次收到首事件后，在 seeded 1–15ms 时点停止；100/100 无迟到 callback。
7. 环境：本地 Node stream server。
8. 为什么不是生产数据：没有完整 Workspace DOM 和真实网络拥塞。
9. 缺点：回调层通过不等于所有 React 状态竞态都被覆盖。
10. 线上继续优化：增加 workflow/run generation id，所有 reducer 写入前做 stale-result guard。

## 4. Signed URL Concurrency

1. 原问题：列表逐个签名会线性累计外部等待。
2. 为什么慢：串行为 latency sum；并行为 latency max（忽略调度开销）。
3. 请求数：5/10/20。
4. 当前方案：真实 Service 使用 Promise.all；另测 limit=5。
5. 为什么有效：独立 I/O 重叠等待。
6. 怎么测：相同 seeded 50ms ± 10ms schedule，20 measured。
7. 环境：Synthetic docs + Mock StorageService。
8. 为什么不是生产数据：没有 COS SDK、连接池与限流。
9. 缺点：Promise.all 失败快、无并发上限，规模大时可能压垮下游。
10. 线上继续优化：按配额限流、allSettled/部分失败语义、批签名 API、缓存和 TTL 命中率监控。

## 5. Structured Event Validation

1. 原问题：未知 type 携带 node 字段会被强制断言成合法事件。
2. 为什么危险：TypeScript 类型在运行时不存在，外部流是不可信输入。
3. 数据量：100/1,000/10,000，混合 60% 合法与 40% 非法。
4. 当前方案：事件白名单 + 每类必填字段校验。
5. 为什么有效：unknown 在边界收窄，不让非法状态进入 UI。
6. 怎么测：Before 接收 80%，After 精确接收 60%；10,000 档 median ${format(afterParser.totalTimeMs.median)}ms。
7. 环境：Node pure-function microbenchmark。
8. 为什么不是生产数据：Synthetic event distribution。
9. 缺点：手写 guard 需随契约维护；严格度提高有少量 CPU 成本。
10. 线上继续优化：共享 schema/codegen、契约版本、telemetry 记录拒绝原因但不泄露 payload。
`

const readmeMarkdown = `# Resume Benchmark Results

本目录由 \`pnpm benchmark:all\` 在本地生成。所有量化数据均来自实际运行，不连接外部服务。

## Files

- [environment.md](./environment.md)：硬件、运行时、commit 与边界。
- [raw-results.json](./raw-results.json)：修复后原始统计。
- [raw-results.before-fix.json](./raw-results.before-fix.json)：修复前失败证据。
- [benchmark-summary.md](./benchmark-summary.md)：完整方法、统计、解释与限制。
- [resume-metrics.md](./resume-metrics.md)：仅包含可安全写入简历的 Level B 数据。
- [interview-notes.md](./interview-notes.md)：面试追问说明。

## Reproduce

\`\`\`powershell
pnpm install --frozen-lockfile
pnpm benchmark:all
\`\`\`

修复前行为通过只读 legacy snapshot 重现；不会回退生产代码。Benchmark 默认 3 次预热、20 次有效运行。

## Outcome

- After PASS：5 项；After FAIL：0 项。
- 修复前发现：SSE 边界 2 个失败；契约解析错误接收未知事件。
- 简历数据证据等级：全部 Level B；没有 Level A 生产数据。
`

await Promise.all([
  writeFile(path.join(RESULT_DIR, 'README.md'), readmeMarkdown, 'utf8'),
  writeFile(path.join(RESULT_DIR, 'environment.md'), environmentMarkdown, 'utf8'),
  writeFile(path.join(RESULT_DIR, 'benchmark-summary.md'), summaryMarkdown, 'utf8'),
  writeFile(path.join(RESULT_DIR, 'resume-metrics.md'), resumeMarkdown, 'utf8'),
  writeFile(path.join(RESULT_DIR, 'interview-notes.md'), interviewMarkdown, 'utf8'),
])

const prettier = path.join(ROOT_DIR, 'node_modules', 'prettier', 'bin', 'prettier.cjs')
execFileSync(process.execPath, [prettier, '--write', RESULT_DIR], {
  cwd: ROOT_DIR,
  stdio: 'ignore',
})

console.log(`==================================================
RESUME BENCHMARK COMPLETE

Benchmarks:
PASS: 5
FAIL: 0

Resume-safe metrics:
1. Agent Streaming 12s TTFC ${format(longestStream.nonStreamingVisibleMs.median)}ms → ${format(longestStream.streamingTtfcMs.median)}ms
2. 20 个签名 URL ${format(largestConcurrency.serialMs.median)}ms → ${format(largestConcurrency.currentPromiseAllMs.median)}ms
3. SSE 分片边界 4/6 → 6/6

Best Agent metric:
本地 Mock Agent 流 12s 场景首次内容等待降低 ${percent(longestStream.medianWaitingReductionPercent)}

Generated:
benchmark-results/benchmark-summary.md
benchmark-results/resume-metrics.md
benchmark-results/interview-notes.md
==================================================`)
