# Benchmark Summary

## Test Environment

Windows_NT 10.0.26200 x64，Intel(R) Core(TM) i7-14650HX，15.78 GiB RAM，Node v22.19.0，pnpm@10.29.3。完整记录见 [environment.md](./environment.md)。

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

- 性能项：3 次 warm-up，不计入统计；20 次有效运行。
- 统计：mean、median、nearest-rank p95、min、max、population standard deviation。
- 小于 1ms 的解析函数：每个样本至少处理 1,000 个事件；10,000 档直接处理 10,000 个事件。
- Jitter 与 Stop 时点：固定 seed LCG，可重复。
- 原始数据：[raw-results.json](./raw-results.json)；修复前证据：[raw-results.before-fix.json](./raw-results.before-fix.json)。

## Benchmarks Executed

## 1. Agent Streaming TTFC

### Problem

非流式 UI 必须等待整个 Agent 请求完成；流式 UI 可在首个有效工作流内容事件到达时展示进度。

### Baseline

Entire response：直到 `workflow_completed` 才对用户可见。

### Current Implementation

项目真实 `createAuthEventSource` + `ReadableStream` + `TextDecoder` + 共享 SSE 契约解析。

### Dataset

本地 Mock Agent 流总时长 4s / 8s / 12s，首内容目标分别为 400ms / 600ms / 750ms，并使用固定 seed jitter。每档 23 个本地并发连接，其中前 3 个作为 warm-up、后 20 个计入统计。

### Raw Statistics

单位：ms。

| Total duration | Metric          |     Mean |   Median |      P95 |      Min |      Max | Std Dev | Median change |
| -------------: | --------------- | -------: | -------: | -------: | -------: | -------: | ------: | ------------: |
|             4s | Streaming TTFC  |   439.89 |   466.23 |   496.84 |   350.67 |   497.14 |   53.08 |         88.4% |
|             4s | Entire response |  4033.74 |  4033.60 |  4034.26 |  4033.36 |  4034.26 |    0.30 |      baseline |
|             8s | Streaming TTFC  |   609.68 |   615.37 |   693.01 |   543.81 |   693.15 |   54.00 |         92.3% |
|             8s | Entire response |  8019.55 |  8019.58 |  8020.39 |  8018.58 |  8020.48 |    0.59 |      baseline |
|            12s | Streaming TTFC  |   764.47 |   770.63 |   833.79 |   683.01 |   834.83 |   43.77 |         93.6% |
|            12s | Entire response | 12020.70 | 12020.68 | 12021.04 | 12020.42 | 12021.09 |    0.20 |      baseline |

### Evidence Level

**B**：真实项目客户端与真实生产事件结构 + Synthetic timing / Local Mock Server。

### Interpretation

12s 场景下首次有效内容 median 为 770.63ms，完整响应可见时间 median 为 12020.68ms，本地等待时间降低 93.6%。

### Limitations

这是本地 Mock Agent 流，不代表线上模型推理、网络或生产监控性能；23 个连接并发启动会包含本地连接调度开销。

## 2. SSE TCP Chunk Boundary and EOF

### Problem

修复前解析器把 `eventType` / `eventData` 放在单次 `reader.read()` 内，状态无法跨 chunk 保留；EOF 也未冲刷尾部 buffer。

### Baseline

修复前源码快照，保存在 `benchmarks/legacy-sse-client.ts`，用于可重复 Before 对照。

### Current Implementation

增量行解析器跨 chunk 保存 event/data 状态，使用 streaming `TextDecoder`，并在 EOF flush 尾部事件。

### Dataset and Result

| Case           | Expected events | Before | After | After status |
| -------------- | --------------: | -----: | ----: | ------------ |
| split-json     |               1 |      0 |     1 | PASS         |
| merged-events  |               2 |      2 |     2 | PASS         |
| utf8-split     |               1 |      1 |     1 | PASS         |
| eof-no-newline |               1 |      0 |     1 | PASS         |
| empty-lines    |               1 |      1 |     1 | PASS         |
| malformed      |               0 |      0 |     0 | PASS         |

Before：4/6；After：6/6。

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

真实 `createAuthEventSource.close()` 同时设置 closed 标志并调用 `AbortController.abort()`。

### Dataset and Raw Statistics

- 固定 seed 随机停止时点：100
- 已确认收到首事件并建立连接：100
- 成功抑制：100
- Stop 后回调：0
- 成功率：100%

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

修复前 10,000 档每样本应接收 6000，实际接收 8000。

### Current Implementation

按 workflow/node 事件白名单校验 type，并校验 action、output、reason、error 等事件级必填字段。

### Raw Statistics

单位：总时间 ms；单事件为 μs。

| Dataset | Events/sample | Mean | Median |  P95 |  Min |  Max | Std Dev | Median/event | Accepted actual/expected |
| ------: | ------------: | ---: | -----: | ---: | ---: | ---: | ------: | -----------: | -----------------------: |
|     100 |         1,000 | 0.18 |   0.14 | 0.21 | 0.06 | 1.30 |    0.26 |       0.1356 |                  600/600 |
|   1,000 |         1,000 | 0.06 |   0.06 | 0.06 | 0.06 | 0.07 |    0.00 |       0.0564 |                  600/600 |
|  10,000 |        10,000 | 0.87 |   0.71 | 1.66 | 0.53 | 3.60 |    0.67 |       0.0707 |                6000/6000 |

### Evidence Level

**B**：真实共享契约解析器 + 真实事件字段结构的 Synthetic Dataset。

### Interpretation

10,000 事件档 median 为 0.71ms，且 6000/6000 接收数完全一致。更严格校验增加了少量 CPU 成本，换取未知事件不再越过边界。

### Limitations

这是纯函数 CPU microbenchmark，不是 React FPS、端到端吞吐或网络吞吐；亚毫秒档受 JIT/GC 噪声影响明显，不推荐写进简历。

## 5. Signed URL Request Aggregation

### Problem

素材列表需为每个私有对象生成短期签名 URL；串行等待会按素材数量线性叠加延迟。

### Baseline

相同 Synthetic AssetDocument 和相同 seeded latency schedule 下串行 await。

### Current Implementation

直接执行项目真实 `AssetsService.getAssets`，其内部以 `Promise.all` 聚合签名 URL；额外测试 limit=5 池作为并发上限对照。

### Dataset

5 / 10 / 20 个素材，每个 Mock 请求 50ms ± 10ms，固定 seed；3 次 warm-up + 20 次有效运行。

### Raw Statistics

单位：ms。

| Requests | Strategy            |    Mean |  Median |     P95 |     Min |     Max | Std Dev | Median change |
| -------: | ------------------- | ------: | ------: | ------: | ------: | ------: | ------: | ------------: |
|        5 | Serial              |  276.74 |  277.02 |  296.30 |  255.78 |  301.08 |   12.85 |      baseline |
|        5 | Current Promise.all |   62.04 |   62.97 |   67.50 |   50.93 |   67.67 |    5.03 |         77.3% |
|        5 | limit=5 pool        |   64.95 |   64.98 |   72.50 |   52.59 |   79.17 |    5.09 |         76.5% |
|       10 | Serial              |  562.74 |  561.12 |  592.84 |  538.23 |  594.05 |   16.67 |      baseline |
|       10 | Current Promise.all |   65.59 |   65.59 |   71.63 |   57.09 |   73.25 |    3.76 |         88.3% |
|       10 | limit=5 pool        |  124.47 |  125.00 |  139.32 |  103.27 |  139.38 |    9.72 |         77.7% |
|       20 | Serial              | 1131.38 | 1136.09 | 1164.55 | 1087.36 | 1182.26 |   26.91 |      baseline |
|       20 | Current Promise.all |   67.79 |   66.60 |   75.41 |   60.90 |   76.45 |    4.68 |         94.1% |
|       20 | limit=5 pool        |  242.48 |  242.47 |  263.92 |  222.64 |  280.35 |   12.35 |         78.7% |

### Evidence Level

**B**：真实 API Service 聚合代码 + Synthetic documents / Mock storage latency。

### Interpretation

20 请求时串行 median 1136.09ms，当前 Promise.all median 66.60ms，降低 94.1%。limit=5 median 242.47ms，较慢但可控制下游并发压力。

### Limitations

Mock 延迟不包含真实 COS 签名计算、连接池、限流、错误重试和带宽；Promise.all 不是无限规模下的最佳策略，生产中应结合下游配额设置并发上限。

## Final Ranking

| Benchmark               | Resume Value | Agent Relevance | Evidence | Interview Value |
| ----------------------- | -----------: | --------------: | -------- | --------------: |
| Agent Streaming TTFC    |        10/10 |           10/10 | B        |           10/10 |
| SSE Chunk / EOF         |         9/10 |           10/10 | B        |           10/10 |
| Stop / Late Event       |         8/10 |            9/10 | B        |            9/10 |
| Signed URL concurrency  |         9/10 |            6/10 | B        |            8/10 |
| Structured event parser |         6/10 |            9/10 | B        |            8/10 |

Top 3 简历量化指标：Agent Streaming TTFC、签名 URL 并发聚合、SSE 分片 4/6 → 6/6。

Top 5 面试性能案例：Agent Streaming、SSE 分片/EOF、Stop/late event、签名 URL 并发权衡、结构化事件边界校验。
