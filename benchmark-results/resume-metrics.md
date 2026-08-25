# Resume-safe Metrics

以下数据均为 **Evidence Level B**，来自本地可重复 Benchmark，不是公司生产监控数据。

## Metric 1: Agent Streaming TTFC

### 推荐简历表达

在本地 Mock Agent 流基准中，基于项目真实 SSE 客户端与事件契约，将 4–12 秒任务的首次有效内容等待时间降低 88.4%–93.6%；12 秒场景 median 由 12020.68ms 降至 770.63ms。

### 数据来源

本地 Node HTTP SSE Server；真实 `createAuthEventSource`、`ReadableStream`、`TextDecoder` 与共享契约；4s/8s/12s 各 3 次预热 + 20 次有效运行。

### Evidence Level

B

### 面试时怎么解释数据来源

离职后无法访问模型服务，所以没有宣称模型推理变快。Mock Server 固定总耗时和首内容时点，测的是 Streaming 相比整包展示的“用户首次看到有效结果”时间。

### 面试风险

低。必须始终带上“本地 Mock Agent 流”限定语。

## Metric 2: Signed URL 并发聚合

### 推荐简历表达

在 20 个私有素材、单请求 50ms ± 10ms 的本地基准中，使用项目真实 Promise.all 聚合将签名 URL 获取 median 从 1136.09ms 降至 66.60ms，降低 94.1%；同时验证 limit=5 池在 242.47ms 完成，以换取受控下游压力。

### 数据来源

真实 `AssetsService.getAssets` + Synthetic AssetDocument + seeded Mock StorageService；3 次预热 + 20 次有效运行。

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
