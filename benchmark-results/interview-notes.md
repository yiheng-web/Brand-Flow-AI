# Interview Notes

## 1. Agent Streaming TTFC

1. 原问题：非流式展示直到任务结束才反馈，长 Agent 链路等待感强。
2. 为什么慢：不是计算更慢，而是 UI 可见时点被绑定到完整响应。
3. 原复杂度/请求数：同一请求；差异是首内容可见时点，不是请求数量。
4. 当前方案：fetch + ReadableStream + TextDecoder 增量消费 SSE，并映射真实 Workflow event。
5. 为什么能提升：首个内容事件到达即可展示，不等待 terminal event。
6. 怎么测：本地 Server 固定 4/8/12s 完成时点，记录首业务事件和 completed 的 performance.now 差值。
7. 环境：Windows_NT 10.0.26200 x64、Node v22.19.0，每档 3 warm-up + 20 measured。
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
6. 怎么测：Before 接收 80%，After 精确接收 60%；10,000 档 median 0.71ms。
7. 环境：Node pure-function microbenchmark。
8. 为什么不是生产数据：Synthetic event distribution。
9. 缺点：手写 guard 需随契约维护；严格度提高有少量 CPU 成本。
10. 线上继续优化：共享 schema/codegen、契约版本、telemetry 记录拒绝原因但不泄露 payload。
