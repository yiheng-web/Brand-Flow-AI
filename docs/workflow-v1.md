# V1.3 工作流状态、任务历史与恢复

## 完成范围

共享契约统一定义 Workflow 与七节点允许的状态转换，新增 Workflow `cancelled` 终态。API 的业务状态更新统一经过 `workflow-state.ts`，用状态、`runVersion` 和 `eventSequence` 做 Mongo CAS；取消与新动作增加运行版本，旧 Worker 的写回被拒绝。节点更新同时包含工作流归属与运行版本。

每个队列任务 ID 为 `workflowId-r<runVersion>-nodeType`。运行中的重复请求不再入队，并发请求仅一个成功认领；入队或节点准备失败进入可重试 `failed`。升级前缺少版本号的运行中记录在 API 初始化时转为失败，避免旧载荷继续写入；用户可从失败节点重试。

通用节点更新仅接受已有方向或合格候选图的选择 ID。客户端不能覆盖候选评分、最终质检、任意节点输出或服务端状态。上传合成期间发生取消或版本变化时，清理尚未提交的新对象；清理失败记录业务 ID，不伪造写入成功。

## API 与持久化

单数 `/workflow` 路由保留，复数 `/workflows` 使用相同 Controller、JWT 与资源归属检查。

| 接口                                                            | 行为                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /workflows?spaceId=personal&status=failed&page=1&limit=20` | 当前用户、当前空间分页，状态可选，按更新时间与 ID 倒序 |
| `GET /workflows/:id`                                            | 返回工作流与七节点数据库快照                           |
| `POST /workflows/:id/cancel`                                    | 取消未完成任务；重复取消幂等；旧版本不能完成写回       |
| `POST /workflows/:id/retry`                                     | 从失败节点认领新版本；运行中重复请求不入队             |
| `GET /workflows/:id/stream`                                     | 数据库快照、序号和心跳通知                             |
| `PUT /workflow/:id/nodes/:nodeType`                             | 只提交 `selectedDirectionId` 或 `selectedCandidateId`  |

Workflow 新增 `runVersion`、`eventSequence`、`currentNode`、`progress`，保留 `awaitingAction`、`updatedAt` 和错误。节点与 Revision 新增 `runVersion`；Workflow 建立用户、空间、更新时间与 ID 的复合索引。旧记录默认版本与序号为 0。Revision 原有 round 保留。

## 页面与恢复

“创作任务”页支持全部状态筛选、分页、继续、取消、失败重试及查看作品。历史入口使用 URL 中的 workflowId，不需要另一设备的任务缓存。作品中心仅描述已保存作品。

工作台先 GET 数据库快照，再携带 Last-Event-ID 订阅。SSE 授权后先建立监听再读快照；队列通知仅触发读库，每 2 秒发送心跳并检查最新快照，补偿通知丢失和 GET/订阅空隙。客户端按序号去重，EOF 或 30 秒无数据后退避重连，重连前再次 GET。取消、失败、完成、登出、身份变化和卸载清理连接与计时器。

服务端发送最新完整快照，不保存或回放每个模型增量；数据库结果是恢复依据。localStorage 只保存当前 workflowId 指针，不保存完整工作流业务状态。取消后仅可查看，不能继续或重跑。

## 实际验证（2026-10-04）

| 验证                                                                                               | 结果                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @brand-flow/api test -- --runInBand`                                                | 11 套、69 项通过，覆盖状态 CAS、旧任务拒绝、队列失败、启动幂等、SSE 授权与监听清理、禁止客户端结果污染                                               |
| `pnpm --filter @brand-flow/web test`                                                               | Vitest 27 项与原生 SSE 1 项通过；覆盖任务切换清理、任务历史交互、EOF 重连、游标去重、超时与认证失败停止重连                                          |
| `pnpm --filter @brand-flow/contracts test`                                                         | 11 项通过，包括合法转换、取消终态与失败重试                                                                                                          |
| `pnpm --filter @brand-flow/agent test`                                                             | 23 项通过                                                                                                                                            |
| `pnpm build`                                                                                       | Contracts、Agent、API、Web 四个包成功                                                                                                                |
| Web / Contracts lint、本次 API 工作流目录 lint                                                     | 通过                                                                                                                                                 |
| API / Agent lint、`pnpm lint`                                                                      | 存量阻塞：109 / 231 个错误；30 个报错源文件与 HEAD 逐一对照完全一致，本次未新增错误                                                                  |
| `node scripts/smoke-workflow.cjs mongodb://127.0.0.1:27018 6381`                                   | 真实 Mongo 8.0、Redis 8、BullMQ：并发启动/重跑单任务、队列失败重试、旧任务延迟返回、取消阻止完成、用户隔离、分页、断线快照恢复、旧版本记录升级均通过 |
| `node scripts/smoke-workflow-browser.cjs mongodb://127.0.0.1:27018 <现有运行时 node_modules 路径>` | 真实本机 Edge：会话 A 启动后关闭；独立会话 B 从历史继续，刷新恢复 Brief；取消后只读且重跑禁用                                                        |

Web Vitest 使用现有 Node 24 运行时。本次未新增依赖、未改锁文件、未创建 Conda 环境。两个冒烟脚本都只允许显式本机临时 Mongo，Redis 6381 必须专用且队列为空；创建独立临时数据库，结束清理数据库、队列与连接。浏览器脚本复用现有 Playwright 和 Edge，不安装到项目。

浏览器验收使用真实 JWT、Mongo、队列和页面，Provider 使用现有 Demo 模式，未调用付费模型或真实 MinIO/Pinecone。已有 React Flow、Ant Design 弃用提示及构建大 chunk 提示仍存在。取消阻止结果落库，不会中断已经发出的远程模型请求。

## Git

02 已按用户要求提交为 `2433bc6 feat(knowledge): 完成个人知识库维护与导入闭环`，包括 `.gitignore`。03 已完成本地验收，并按用户后续要求单独提交；04 在其后实施。02、03 本次均未推送。
