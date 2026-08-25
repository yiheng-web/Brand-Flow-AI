# Benchmark Environment

| Item                      | Value                                               |
| ------------------------- | --------------------------------------------------- |
| Captured at               | 2026-08-24T14:20:17.794Z                            |
| OS                        | Windows_NT 10.0.26200 x64                           |
| CPU                       | Intel(R) Core(TM) i7-14650HX                        |
| Logical CPUs              | 24                                                  |
| RAM                       | 15.78 GiB                                           |
| Node.js                   | v22.19.0                                            |
| Package manager           | pnpm@10.29.3                                        |
| Browser                   | 未使用浏览器；SSE 使用 Node 22 fetch/ReadableStream |
| Benchmark commit          | `272b22f4b4c488d07a85ab5b16a29dd1c65d0508`          |
| Branch                    | `benchmark/resume-performance`                      |
| Worktree dirty during run | yes                                                 |

## Runtime Boundaries

- 未连接真实后端、COS、模型服务、Redis、MongoDB、SSE 服务或企业内网。
- Git 安全审批器拒绝了自动提交，因此 commit 是基准点，Benchmark 与修复文件在运行时为未提交工作树内容。
- Streaming 通过本地 Node HTTP Server 与项目真实 `createAuthEventSource` 执行。
- 签名 URL 使用固定 seed 的 50ms ± 10ms Mock 延迟和项目真实 `AssetsService.getAssets`。
- 未启动浏览器，因此没有 Chrome 版本、DOM 节点、浏览器 Heap、Long Task 或 FPS 数据。
- 测量使用 Node `performance.now()`；OS 调度、GC 和同机进程仍会带来噪声。
