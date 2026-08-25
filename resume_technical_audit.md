# Brand-Flow AI 源码级简历技术审计

> 审计日期：2026-08-24  
> 审计基线：分支 `benchmark/resume-performance`，HEAD `272b22f4b4c488d07a85ab5b16a29dd1c65d0508`  
> 审计对象：当前工作树，而不只是 HEAD。工作树在审计开始前已有 Web/API/Agent/Contracts、Benchmark 等未提交改动。  
> 证据边界：源码与 Git 历史为主；Benchmark 是本地可重复 Level B 证据，不是生产监控；未执行浏览器/Fabric 真机 E2E、真实模型、MongoDB、Redis、MinIO 或线上压测。

## 阅读结论

这个仓库最有价值的部分不是“用了 React、NestJS、LangGraph”，而是把一个长链路 AI 图文生成过程做成了可暂停、可恢复、可人工介入、可追踪、可验证来源的工程系统。最值得面试展开的是以下四条主线：

1. 鉴权 SSE 的增量协议解析、断流恢复与迟到事件抑制；
2. BullMQ + MongoDB 驱动的七节点持久化工作流与 Human-in-the-loop 检查点；
3. 付费生图检查点、失败重跑复用、对象存储补偿删除与状态一致性；
4. Fabric.js 确定性排版、受控模型输出、PNG/图层/像素区域完整性验证。

仓库也有明显短板：旧 LangGraph 链仍大量使用 `any` 且不是当前 V1 主链路；Tool Calling/MCP 不存在；V1 默认禁用向量检索；普通素材上传的文件安全校验不完整；部分队列入队路径缺少失败回滚；SSE 服务端存在“异步鉴权完成前先注册 QueueEvents 监听”的短窗口风险。简历应只写已经有源码证据的能力。

# 项目基本信息

- 项目：Brand-Flow AI 智能图文创作平台。
- 形态：`pnpm@10.29.3` workspaces + Turborepo 的 TypeScript Monorepo。
- 当前 Git 身份：`yiheng-web <1781159625@qq.com>`。
- 当前 HEAD 作者与 Git 身份一致；全仓非合并提交中该身份约 35 条，是提交数最多的单一身份。
- 核心产物：从结构化品牌需求出发，经历 Brief、品牌约束、创意方向、Prompt、四候选图、可选图文合成、最终质检，再保存为带版本与导出记录的作品。

# 项目架构

```text
React Web
  ├─ apiClient / fetch SSE
  ├─ Zustand workflow/auth/user state
  ├─ React Flow 节点可视化
  └─ Fabric.js 确定性图文合成
           │ REST + authenticated SSE
           ▼
NestJS API
  ├─ JWT / Space / creator ownership
  ├─ Workflow Service + BullMQ Processor
  ├─ MongoDB workflow/node/revision/work schemas
  ├─ MinIO/S3 private objects + signed URL
  └─ shared contracts validation
           │ public package exports
           ▼
Agent package
  ├─ SiliconFlow chat/vision/image adapter
  ├─ Brief / direction / prompt / evaluation logic
  ├─ controlled structured-output validation
  └─ optional Pinecone retrieval
```

架构边界总体合理：Web 不直接依赖 Agent；API 负责鉴权、持久化、队列与对象存储；Agent 负责模型调用与生成领域逻辑；`packages/contracts` 统一七节点、状态、SSE 事件和合成契约。

# 技术栈

| 层     | 技术                                     | 源码中真实用途                                                   |
| ------ | ---------------------------------------- | ---------------------------------------------------------------- |
| Web    | React 19、Vite、React Router、Ant Design | 页面、交互状态、异步态与路由鉴权                                 |
| 可视化 | React Flow、Fabric.js                    | 工作流节点图、艺术字区域框选与确定性渲染                         |
| 状态   | Zustand + persist                        | 登录、工作流恢复、跨页面状态共享                                 |
| API    | NestJS 11、Mongoose、class-validator     | HTTP、DTO、鉴权、持久化、统一异常                                |
| 异步   | BullMQ、Redis、RxJS/SSE                  | 长任务排队、节点进度、流式订阅                                   |
| AI     | LangChain.js、LangGraph.js、SiliconFlow  | 结构化生成、视觉质检；LangGraph 为旧链，V1 主链由 Processor 编排 |
| RAG    | Pinecone、textsplitters                  | 可选向量入库/检索；V1 默认 `KNOWLEDGE_VECTOR_MODE=disabled`      |
| 文件   | S3 SDK、MinIO、Sharp                     | 私有对象、短期 URL、PNG 验证、像素差异检查                       |
| 契约   | 独立 `@brand-flow/contracts` 包          | Web/API/Agent 共享状态、事件和领域类型                           |

# 核心业务链路

1. Web 创建 `pending` Workflow，服务端写入七个初始节点。
2. 用户明确选择是否图文分离；API 使用带 `status: pending` 条件的原子更新认领启动权，再入 BullMQ。
3. Processor 按节点执行，并把 queued/running/completed/failed/skipped 写入 MongoDB，同时通过 `job.updateProgress` 发 SSE。
4. Brief、创意方向、候选图三处进入 `awaiting_user`，用户选择后从指定节点继续。
5. 四候选图先持久化到私有对象存储，再执行视觉质检；质检失败重跑时可复用已付费生成结果。
6. 若需要图文合成，Agent 只返回受控艺术字参数，Web 用 Fabric.js 渲染；服务端验证 PNG、图层、来源和像素变化区域。
7. 最终质检通过后，作品自动保存；服务端只接受当前用户、当前 Space、已完成且质检通过的可信工作流，并复制可信对象生成版本。

# S级技术亮点

## 亮点 001：鉴权 SSE 的跨 chunk 增量解析、终止与断流恢复

### 推荐等级

S

### 类型

AI Agent、Streaming、异步并发、稳定性、React 生命周期

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          5 |        5 |          5 |        5 |        4 |            5 |        5 |

### 业务场景

浏览器需要携带 JWT 订阅工作流节点事件。标准 `EventSource` 不能自定义 `Authorization` 请求头，因此项目使用 `fetch + ReadableStream + TextDecoder` 自行实现 SSE 客户端。

### 潜在问题

- TCP chunk 不等于 SSE event：`event:` 行、`data:` 行和 JSON 可能被拆到不同 chunk；局部变量若每次 `reader.read()` 重置，会静默丢事件。
- UTF-8 中文可能跨字节切分；非 streaming decoder 可能产生乱码。
- 服务端 EOF 前最后一条事件可能没有尾部空行，若不 flush 会丢终态。
- 用户离开页面或主动关闭后，迟到事件若继续回调，会让 UI“复活”或覆盖恢复后的状态。
- SSE 断开后只报错不恢复，前端会永久停留在旧节点状态。

### 当前实现

`createWorkflowSseParser` 把 `buffer`、`eventType`、多行 `data` 保存在解析器闭包中，跨 chunk 累积；`finish()` 在 EOF 冲刷尾部。解析后还进入共享契约 `parseWorkflowSseEvent`，未知事件或缺字段事件不会进入 UI。`close()` 同时设置 `closed` 与 `AbortController.abort()`；Workspace 在新连接前关闭旧连接，终态关闭连接，断流则用单例恢复定时器回查 MongoDB 快照，卸载时清理连接和定时器。

### 核心源码

文件：`apps/web/src/utils/sse.ts`  
位置：`createWorkflowSseParser`、`createAuthEventSource`

```ts
let buffer = ''
let eventType = ''
let eventDataLines: string[] = []

const parser = createWorkflowSseParser()
for (const event of parser.push(decoder.decode(value, { stream: true }))) {
  options?.onMessage?.(event)
}

close: () => {
  closed = true
  controller.abort()
}
```

文件：`apps/web/src/pages/workspace/workspace.tsx`  
位置：`connect`、`recover`、卸载 cleanup

```ts
connectionRef.current?.close()
if (recoveryTimerRef.current !== null) return
recoveryTimerRef.current = window.setTimeout(() => {
  recoveryTimerRef.current = null
  void recoverRef.current(workflowId)
}, 1200)
```

### 技术原理

ReadableStream 提供的是任意字节分块，不保证消息边界；`TextDecoder(..., { stream: true })` 保留未完成的多字节字符状态。SSE 以空行分隔事件，允许一个事件包含多行 `data:`。Abort signal 终止 fetch/reader；额外的 `closed` 标志阻止 abort 异常和迟到回调进入业务层。`recoverRef` 保存最新恢复函数，避免回调捕获过期闭包。

### 为什么这样设计

相比标准 EventSource，这种方案能携带 JWT；相比只解析 `data:` 单行，状态机更接近 SSE 规范；相比盲目自动重连，断流后读取服务端持久化快照能恢复真实状态，不依赖事件一定不丢。

### 替代方案

- Cookie 鉴权 + 原生 EventSource：实现简单，但需要调整认证与 CSRF 策略。
- `@microsoft/fetch-event-source`：仓库已有依赖，可减少协议实现成本；当前自研方案优势是行为可测试、契约校验明确，但需承担协议兼容性维护。
- WebSocket：适合双向实时通信，但当前主要是服务端单向进度，SSE 更轻。

### 边界情况

已覆盖跨 chunk、EOF、畸形 JSON；仍缺少 `id:`/`retry:`、超长事件、心跳超时、断线自动续传 `Last-Event-ID` 和完整浏览器 E2E。服务端 `streamWorkflow` 在异步鉴权完成前已经注册 QueueEvents listener，理论上存在短窗口越权事件泄露风险，必须先修复才能宣称端到端安全。

### 面试官可能怎么问

1. 为什么 `reader.read()` 返回的 chunk 不能当作一条 SSE 消息？
2. `TextDecoder` 的 `stream: true` 解决了什么问题？
3. AbortController 与布尔 `closed` 为什么要同时存在？
4. SSE 断线后为什么选择状态恢复，而不是只重连？
5. 如何避免重复连接和旧连接事件覆盖新状态？

### 我需要补学什么

SSE wire format、TCP 分包/粘包、UTF-8 增量解码、AbortController、React effect cleanup、幂等事件与 Last-Event-ID。

### 5分钟学习路线

1. 手写一条包含 `event` 与多行 `data` 的 SSE 报文。
2. 用任意位置切片模拟 TCP chunk。
3. 解释 parser 闭包中三个状态变量的生命周期。
4. 画出 close、AbortError、late event 的时序图。
5. 说明断流恢复为什么以 MongoDB 快照为事实源。

### 简历候选表达

实现携带 JWT 的 Agent SSE 增量客户端，处理 TCP/UTF-8 分片、EOF flush、非法事件过滤、连接取消与断流状态恢复；本地确定性边界用例由 4/6 提升至 6/6。

### 个人贡献可信度

高（当前 Git 身份与工作树一致），但 SSE parser 修复与 Benchmark 仍未提交；简历描述必须标注为当前分支工作，不能说已合入主干。

## 亮点 002：七节点持久化工作流与 Human-in-the-loop 检查点

### 推荐等级

S

### 类型

AI Agent、状态机、架构设计、异步任务、可恢复性

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          5 |        5 |          5 |        5 |        3 |            5 |        5 |

### 业务场景

AI 生成不是一次 HTTP 请求，而是 Brief → 品牌约束 → 创意方向 → Prompt → 四候选图 → 合成 → 最终质检。Brief、创意方向、候选图都需要用户确认后才能继续。

### 潜在问题

如果只在内存中串行 `await`：服务重启或页面刷新会丢进度；用户无法在中间节点干预；前端看到的状态与队列真实状态可能不一致；失败后只能整链重跑。

### 当前实现

共享契约定义七节点、节点状态、工作流状态和等待动作。API 创建 Workflow 与七个 Node 快照；BullMQ Processor 每步先持久化 queued/running/completed，再发送结构化事件。Brief、CreativeDirection、Generate 完成后写 `awaiting_user` 和明确 action 并返回，用户确认后按节点重新入队。重连时服务端先发当前等待/完成/失败快照，前端也可通过详情接口恢复节点状态与输出。

### 核心源码

文件：`packages/contracts/src/index.ts`  
位置：`WORKFLOW_NODE_ORDER`、`WorkflowAwaitingAction`

```ts
export const WORKFLOW_NODE_ORDER = [
  'brief',
  'brandConstraint',
  'creativeDirection',
  'prompt',
  'generate',
  'compose',
  'finalEvaluation',
] as const
```

文件：`apps/api/src/modules/workflow/workflow.processor.ts`  
位置：`process`

```ts
const awaitingAction =
  nodeType === 'brief'
    ? 'confirm_brief'
    : nodeType === 'creativeDirection'
      ? 'select_direction'
      : nodeType === 'generate'
        ? 'select_candidate'
        : undefined
```

### 技术原理

这是持久化状态机而不是纯前端 stepper。MongoDB 保存长期状态，BullMQ 承担任务调度，SSE 只是实时投影；任何实时事件丢失后都能以数据库快照恢复。Human-in-the-loop 通过明确的等待状态把长任务拆成多个可恢复事务边界。

### 为什么这样设计

AI 结果具有不确定性，关键决策不能完全黑盒自动化。将“模型执行”和“用户确认”建模为正式状态，才能支持刷新恢复、审计、重跑和多人协作演进。

### 替代方案

LangGraph checkpointer、Temporal、AWS Step Functions 都能提供更完整的 durable execution。当前方案复用现有 NestJS/Mongo/BullMQ，学习成本与部署成本更低，但一致性与补偿逻辑需要自己维护。

### 边界情况

必须防止错误 action 下修改节点、旧候选被再次选择、跳过 compose 后进度仍按七节点计算、队列入队失败后状态悬挂。当前对 action/候选版本已有校验，但部分继续执行路径缺少入队失败回滚。

### 面试官可能怎么问

1. 为什么 SSE 不能作为唯一状态源？
2. `awaiting_user` 与普通 `pending` 有什么语义差异？
3. 页面刷新后如何恢复到正确节点？
4. 如何支持从任意节点重跑且不污染下游结果？
5. 为什么没有直接用 LangGraph 跑完整 V1？

### 我需要补学什么

持久化状态机、任务队列、事件溯源与状态快照、幂等消费、Saga/补偿事务、Human-in-the-loop Agent。

### 5分钟学习路线

1. 画出七节点状态转移图。
2. 标出三个 `awaiting_user` 检查点。
3. 说明 Mongo、BullMQ、SSE 各自职责。
4. 模拟刷新、服务重启、事件丢失三种故障。
5. 解释从节点重跑时下游为何必须 stale。

### 简历候选表达

基于 MongoDB、BullMQ 与 SSE 构建七节点可恢复 AI 工作流，将 Brief、创意方向和候选图选择建模为 Human-in-the-loop 检查点，支持刷新恢复、节点级重跑和执行过程可视化。

### 个人贡献可信度

中到高。V1 主链的大量当前代码与最近提交由 `yiheng-web` 完成；底层 SSE/队列早期提交有 FunEnn、lihongzy 等共同贡献，不能表述为独立从零实现。

## 亮点 003：原子启动、队列失败回滚与重复提交防护

### 推荐等级

S

### 类型

并发控制、幂等、状态一致性、防御性编程

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          4 |        5 |          5 |        5 |        2 |            4 |        5 |

### 业务场景

用户可能双击“运行”、多个标签页同时启动同一工作流，或请求超时后重试；Redis/BullMQ 也可能在 Mongo 状态已更新后入队失败。

### 潜在问题

简单的“先查询 pending，再 update，再 add job”存在 TOCTOU 竞态：两个请求都看到 pending 并重复入队；若先置 running 后入队失败，工作流会永久显示运行中但没有 Worker 任务。

### 当前实现

服务端使用 `findOneAndUpdate({_id, status:'pending'})` 原子认领启动权，只有一个请求能拿到 Workflow；BullMQ job 使用稳定 jobId。入队失败时用条件更新把仍为 running 的 Workflow 恢复成 pending，并清除本次写入的 composition 选项。非 pending 重复启动直接返回现状。Jest 覆盖原子条件、失败回滚和不重复入队。

### 核心源码

文件：`apps/api/src/modules/workflow/workflow.service.ts`  
位置：`start`

```ts
const workflow = await this.workflowModel.findOneAndUpdate(
  { _id: accessibleWorkflow._id, status: 'pending' },
  { $set: { needsComposition: dto.needsComposition, status: 'running' } },
  { new: true },
)
```

### 技术原理

将“检查状态 + 修改状态”压到单个数据库原子操作，消除应用层 check-then-act 竞态。回滚更新也带状态条件，避免覆盖已经被其他合法流程推进的状态。

### 为什么这样设计

前端 `loading` 只能改善用户体验，无法防住多标签页、重试、脚本调用。真正的幂等边界必须在服务端。

### 替代方案

Mongo 事务、Redis 分布式锁、唯一幂等键都可实现。当前单文档条件更新足以覆盖启动权争抢，成本低于分布式锁；jobId 提供队列侧第二道防线。

### 边界情况

当前 `runNode`、`queueNode` 等继续执行路径没有同等级的入队失败回滚；如果 Queue add 失败，可能留下 running 或已清空下游结果的 Workflow。这应作为下一步一致性修复，而不是被简历描述掩盖。

### 面试官可能怎么问

1. 为什么前端禁用按钮不能保证幂等？
2. `findById` 后再 `save` 为什么仍可能重复？
3. Mongo 条件更新与 Redis 锁如何取舍？
4. 入队失败为什么需要补偿？
5. 如果 add 成功但 HTTP 响应丢失，重试会怎样？

### 我需要补学什么

TOCTOU、幂等键、原子条件更新、至少一次投递、outbox pattern、分布式事务补偿。

### 5分钟学习路线

1. 写出两个请求并发启动的错误时序。
2. 把 check/update 合并为条件更新。
3. 加入队列失败场景。
4. 解释 jobId 的作用和限制。
5. 思考 outbox 如何进一步消除 Mongo/Redis 双写窗口。

### 简历候选表达

使用 MongoDB 条件原子更新与 BullMQ 稳定 jobId 防止工作流重复启动，并在队列写入失败时补偿回滚状态；相关 Jest 覆盖并发认领、重复调用和 Redis 不可用场景。

### 个人贡献可信度

高。Git 提交 `272b22f` 由当前 Git 身份完成，提交主题直接是“修复主链路启动与作品隔离”。

## 亮点 004：付费生图检查点、重跑复用与对象存储补偿

### 推荐等级

S

### 类型

AI Agent 产品化、成本控制、容错、并发、补偿事务

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          5 |        5 |          5 |        5 |        4 |            5 |        5 |

### 业务场景

四张候选图由外部 Provider 生成，已经产生费用；后续视觉质检仍可能因为超时、429、JSON 解析或模型异常失败。

### 潜在问题

若“生成 + 质检”只在最后一次性持久化，质检失败会丢掉已经生成的四张图；用户重试会再次付费生图。并行上传若部分成功后整体失败，还会在对象存储留下孤儿文件。

### 当前实现

Processor 将候选图并行导入私有对象存储，全部带稳定 objectKey；生成成功后立即把候选图检查点写回 Workflow 和 generate Node，再调用视觉质检。重跑 failed generate 时，如四个候选均有 objectKey，则清空 evaluations、重新签名 URL，只重跑质检。并行上传失败时记录已上传 key 并补偿删除。重试只对 timeout/network/429/5xx/JSON 等可重试错误生效，并做短退避。

### 核心源码

文件：`apps/api/src/modules/workflow/workflow.processor.ts`  
位置：`executeNode('generate')`、`persistGeneratedCandidates`

```ts
const checkpointResult = { ...result, generate: checkpoint }
await this.persistProgress(workflow._id.toString(), checkpointResult)

const canReusePersistedCandidates =
  reusableCandidates?.length === 4 &&
  reusableCandidates.every((candidate) => typeof candidate.metadata?.objectKey === 'string')
```

### 技术原理

把昂贵且不可逆的外部副作用设为单独 checkpoint；后续可重试步骤只消费已持久化产物。对象存储与 Mongo 不是一个事务，因此使用 Saga 风格补偿删除处理部分成功。

### 为什么这样设计

AI 产品的稳定性不仅是“请求不报错”，还包括避免重复计费与结果浪费。检查点将失败域缩小到质检步骤。

### 替代方案

BullMQ 子 Job、工作流引擎 activity retry、outbox/inbox、对象生命周期清理任务。当前实现简单直接，但重试错误分类依赖错误消息正则，不如结构化错误码稳健。

### 边界情况

上传完成但进程在记录 `uploadedKeys` 前崩溃仍可能留孤儿；删除补偿失败被忽略；固定 250/500ms 退避没有 jitter；对象 key 固定会覆盖同一轮候选。需要后台垃圾回收与结构化 Provider 错误进一步完善。

### 面试官可能怎么问

1. 为什么质检失败不应该重跑生图？
2. Mongo 与 S3 双写如何保证最终一致性？
3. 哪些错误可以重试，哪些不能？
4. Promise.all 部分失败时已经成功的上传怎么办？
5. 如何防止重试风暴？

### 我需要补学什么

AI 成本治理、checkpoint、Saga、指数退避与 jitter、幂等对象 key、最终一致性、死信队列。

### 5分钟学习路线

1. 把 generate 与 evaluate 拆成两个故障域。
2. 标记付费副作用发生点。
3. 画出四图上传部分成功场景。
4. 解释重跑如何读取 objectKey。
5. 给出指数退避和垃圾回收改进方案。

### 简历候选表达

为四候选付费生图建立持久化检查点，质检失败时复用已落盘候选只重跑评估，并通过补偿删除处理并行对象上传的部分失败，降低重复调用外部模型的成本风险。

### 个人贡献可信度

中到高。当前 V1 逻辑主要由 `yiheng-web` 提交；早期“生图重跑缓存控制”见 FunEnn 的 `f5188cd`，属于多人演进成果。

## 亮点 005：Fabric 确定性合成与服务端像素区域完整性验证

### 推荐等级

S

### 类型

复杂交互、图形工程、安全、数据一致性、AI 可控生成

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          5 |        5 |          5 |        5 |        3 |            5 |        5 |

### 业务场景

生图模型直接生成中文、Logo 和精确排版容易乱码。项目把底图生成与文字排版拆开：模型给受控样式与放置建议，浏览器用 Fabric.js 确定性渲染真实文字。

### 潜在问题

仅相信客户端上传的 PNG 和 JSON，会出现候选过期、文字被模型改写、图层与选择不一致、上传了另一张图、框外篡改底图、低分候选绕过质检等问题。

### 当前实现

前端使用 0～1 归一化区域保存跨分辨率坐标；拖拽/缩放被限制在画布边界，旋转后的 bounding box 再平移回框选区域。导出前隐藏辅助框，在 `finally` 恢复。服务端核对当前 workflow action、底图/艺术字候选版本、文本逐字一致、placement JSON、唯一 art_text layer、vectorSpec、PNG 文件头、宽高、32MP 上限和可信 objectKey。Sharp 并行解码底图与成片，逐像素确认框内发生足够变化、框外没有异常变化，并计算绑定 workflow/来源/文本/参数的 SHA-256。

### 核心源码

文件：`apps/api/src/modules/workflow/workflow.service.ts`  
位置：`saveComposition`、`assertCompositionPixels`

```ts
if (changedInside < Math.max(64, Math.floor(regionPixels * 0.001))) {
  throw new BadRequestException('框选区域内未检测到足够的艺术字像素变化')
}
if (changedOutside > Math.max(64, Math.floor(outsidePixels * 0.001))) {
  throw new BadRequestException('框选区域外发生了异常变化')
}
```

文件：`apps/web/src/pages/workspace/components/ArtTextComposer.tsx`  
位置：`renderPlacedText`、`handleExport`

### 技术原理

归一化坐标把交互画布坐标与原始像素解耦；Fabric 负责可视编辑和确定性 rasterization；服务端通过魔数、尺寸、图层契约、内容哈希与像素差进行纵深校验，不信任客户端声明。

### 为什么这样设计

这是把生成式 AI 的“建议”限制在安全参数空间，再由确定性渲染器产出最终资产，兼顾创意与可控性。服务端验证保证最终作品确实来自可信底图与指定文字，而不是任意客户端文件。

### 替代方案

服务端统一用 Sharp/SVG 渲染可获得更强一致性；Canvas/WebGL 可提供更细粒度性能控制。当前 Fabric 适合交互式框选和预览，但客户端导出仍依赖字体可用性与浏览器渲染差异。

### 边界情况

像素差阈值可能误判高压缩/透明度/抗锯齿；当前 O(width×height×4) 检查对 32MP 文件成本较高；字体跨系统差异尚无 E2E；只允许一层艺术字，复杂多文本设计尚未覆盖。

### 面试官可能怎么问

1. 为什么用归一化坐标而不是直接存像素？
2. 旋转文本如何保证不超出区域？
3. 为什么隐藏辅助框必须放在 finally 中？
4. 服务端为什么不能只检查 MIME？
5. 像素差校验的误报和性能如何权衡？

### 我需要补学什么

Canvas/Fabric 对象模型、坐标变换、旋转包围盒、PNG 文件结构、Sharp raw pixels、内容完整性哈希、客户端不可信边界。

### 5分钟学习路线

1. 解释显示尺寸与原图尺寸的 scale。
2. 把框选区域转换为 0～1 坐标。
3. 推导旋转矩形 bounding box。
4. 说明导出时为什么隐藏辅助图层。
5. 复述服务端从 DTO 到像素差的验证链。

### 简历候选表达

将 AI 艺术字输出约束为受控向量参数，使用 Fabric.js 完成归一化区域框选与确定性 PNG 渲染，并在服务端校验候选版本、图层契约、PNG 魔数、分辨率及框内/框外像素差，防止成片来源被替换。

### 个人贡献可信度

高。核心 V1 艺术字闭环见当前身份提交 `5f662b4`、`96c63c4`；但初始艺术字接口另有贡献者，不能声称所有相关模块均独立完成。

## 亮点 006：可信作品保存、个人隔离与对象补偿

### 推荐等级

S

### 类型

安全、多租户、幂等、版本管理、数据一致性

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          4 |        5 |          5 |        5 |        2 |            4 |        5 |

### 业务场景

前端完成工作流后自动保存作品。客户端会提交 imageUrl、objectKey、qualityReport 等字段，但这些都不能直接信任；同一完成事件也可能因恢复或重连触发多次保存。

### 潜在问题

攻击者可能拿别人的 workflowId/objectKey 保存为自己的作品；团队 Space 列表可能泄漏其他成员作品；重复完成事件可能创建多个作品和对象；Mongo 创建失败会留下已复制的对象。

### 当前实现

服务端按 `{_id: workflowId, userId}` 查询来源，并要求 Space 一致、Workflow completed、最终质检 passed、可信 objectKey 位于 `workflows/{userId}/{workflowId}/`。作品当前统一按 creator 私有保存，列表查询同时带 `spaceId + creatorId`。Workflow 上有唯一约束/重复查询，Mongo duplicate key 时删除本次对象并返回已存在作品。Work 或首版本创建失败会分别删除数据库记录和对象。前端 `autoSaveWorkflowRef` 防止同一 workflow effect 重复触发，失败后允许显式重试。

### 核心源码

文件：`apps/api/src/modules/works/works.service.ts`  
位置：`create`、`findAccessibleWork`

```ts
const workflow = await this.workflowModel.findOne({ _id: dto.workflowId, userId })
if (!trustedObjectKey.startsWith(`workflows/${userId}/${dto.workflowId}/`)) {
  throw new BadRequestException('工作流成片缺少可信对象存储来源')
}
```

### 技术原理

服务器重新推导可信字段，不把客户端 DTO 当权威；对象 key 命名空间和 creatorId 形成纵深隔离；唯一键/重复读取保证幂等；跨 Mongo/S3 的部分失败通过补偿删除处理。

### 为什么这样设计

作品是最终可下载资产，安全要求高于普通 UI 状态。只校验“用户能进入 Space”不等于能读取 Space 中所有人的作品，因此当前明确按 creator 隔离。

### 替代方案

对象复制可交由异步 Job；Mongo transaction + outbox 可降低双写窗口；团队共享作品应引入明确 ACL，而不是删除 creator 过滤。

### 边界情况

`createVersion` 仍接受客户端 imageUrl/objectKey，相比 `createTrustedVersion` 边界更弱；删除多个对象使用 Promise.all，任一删除失败会阻断数据库删除但可能已删除部分对象；需要幂等清理任务。

### 面试官可能怎么问

1. 为什么客户端提交的 objectKey 不能直接保存？
2. Space 访问权与作品访问权有什么区别？
3. 自动保存如何避免重复？
4. S3 成功、Mongo 失败怎么处理？
5. 如何设计团队共享作品 ACL？

### 我需要补学什么

多租户隔离、IDOR、资源所有权、幂等写、唯一索引、对象存储一致性、ACL/RBAC。

### 5分钟学习路线

1. 列出客户端可伪造字段。
2. 从 Workflow 重新推导可信来源。
3. 画出重复完成事件时序。
4. 解释 unique key 与前端 ref 的双层作用。
5. 说明补偿删除仍不是强事务。

### 简历候选表达

收紧 AI 成片到作品的信任边界：服务端基于用户、Space、质检终态和对象 key 命名空间重新校验来源，并用唯一约束、重复写回读及对象补偿删除实现自动保存幂等与个人作品隔离。

### 个人贡献可信度

高。Git 提交 `272b22f` 由当前身份完成，并明确包含作品隔离修复。

# A级技术亮点

## 亮点 007：模型结构化输出的白名单、范围与交叉校验

### 推荐等级

A

### 类型

AI Agent、防御性编程、Structured Output、安全

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          4 |        5 |          5 |        5 |        1 |            5 |        5 |

### 业务场景

模型返回 Brief、三个创意方向、Prompt、四项视觉评分和四个艺术字样式；这些 JSON 会进入业务状态和渲染器。

### 潜在问题

模型可能返回 Markdown 包裹、非法 JSON、缺字段、未知候选 ID、越界分数、重复方案、修改用户文字、任意字体/颜色/阴影参数，甚至向 vectorSpec 注入未支持字段。

### 当前实现

调用侧要求 JSON response format，解析侧用 safe JSON parser；每个领域再做语义校验。创意方向要求恰好三个且 id/style/composition/colorStrategy 互异；候选评分要求四项、ID 属于输入集合、0～10；艺术字要求文本逐字一致、四套 vectorSpec 不同、只允许固定字段、字体白名单、HEX 颜色、字重/描边/阴影/旋转/装饰范围。非法输出抛出可诊断错误，不直接进入 Fabric。

### 核心源码

文件：`packages/agent/src/v1-workflow.ts`  
位置：`createCreativeDirections`、`evaluateCandidateImages`、`validateArtTextVectorSpec`、`generateArtTextCandidates`

```ts
if (!hasOnlyKeys(spec, allowedKeys)) {
  throw new Error('艺术字样式包含未受控参数')
}
if (candidate.textContent !== input.textContent) {
  throw new Error('艺术字 Provider 修改了用户文本')
}
```

### 技术原理

JSON 可解析不等于业务合法。校验分为语法、结构、值域、集合归属、跨字段一致性和多结果全局约束。模型始终是不可信输入。

### 为什么这样设计

比单纯 TypeScript 类型断言可靠，因为类型在运行时不存在。受控参数空间还能避免让模型直接生成 HTML/SVG/script。

### 替代方案

Zod/JSON Schema/Ajv 能减少手写校验并生成更清晰错误路径。当前手写校验表达了较多跨记录语义，但应逐步引入 schema，避免漏字段和重复逻辑。

### 边界情况

`safeJsonParse` 的 fallback 不能替代严格 schema；颜色只接受六位 HEX，产品能力有限；旧 `graph.ts` 仍有非空断言和大量 `any`，不要把整个 Agent 包都描述成强类型。

### 面试官可能怎么问

1. JSON parse 成功后还要校验什么？
2. 为什么 TypeScript 不能保护模型返回值？
3. 如何验证四个候选没有 ID 串线？
4. 为什么禁止模型返回 SVG/HTML？
5. 手写校验与 Zod 如何取舍？

### 我需要补学什么

JSON Schema、Zod/Ajv、运行时类型系统、Prompt injection、结构化输出、cross-field validation。

### 5分钟学习路线

1. 列出语法与语义校验差异。
2. 看三个方向的全局唯一性约束。
3. 看评分 ID 与输入集合交叉校验。
4. 看 vectorSpec 白名单和值域。
5. 尝试用 Zod 重写一个 schema。

### 简历候选表达

为 LLM 结构化输出建立语法、字段白名单、值域、候选 ID 归属及跨结果唯一性校验，阻止非法评分、文字篡改和未受控艺术字参数进入业务状态与 Fabric 渲染链。

### 个人贡献可信度

高。相关 V1 文件的主要近期提交来自当前 Git 身份。

## 亮点 008：下游 stale 级联与用户选择版本校验

### 推荐等级

A

### 类型

状态一致性、防御性编程、版本管理

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          4 |        5 |          4 |        5 |        2 |            4 |        4 |

### 业务场景

用户修改 Brief、切换创意方向、选择另一张候选图或根据反馈优化 Prompt，已有下游结果都可能基于旧输入。

### 潜在问题

如果只更新当前节点，旧 Prompt、旧候选、旧合成和旧质检仍显示为有效；用户可能把旧候选 ID 提交到新一轮工作流，造成跨版本状态污染。

### 当前实现

共享契约通过节点顺序计算全部 downstream；Service 在修改当前节点后删除下游 result，并批量把下游 Node 标记为 `stale`。选择创意方向和候选图时必须处于对应 awaiting action，并验证 ID 存在于服务端当前 node.output；候选还必须有对应评估且得分至少 6。优化历史单独保存 previous/revised prompt、previous generate、round 和状态。

### 核心源码

文件：`packages/contracts/src/index.ts`：`downstreamNodeTypes`  
文件：`apps/api/src/modules/workflow/workflow.service.ts`：`updateNodeOutput`、`clearDownstreamResult`、`optimize`

### 技术原理

这是依赖图上的缓存失效：上游输入变化意味着所有传递依赖都不再可信。`stale` 比简单 pending 更能表达“曾经有结果，但当前版本已失效”。

### 为什么这样设计

普通 if/else 能处理单个节点，但七节点多处可编辑时容易遗漏。由统一顺序推导下游，使新增节点的失效规则集中维护。

### 替代方案

每个结果携带 input hash/version，读取时动态判断；或使用 DAG 版本向量。当前级联删除实现直观，但缺少原子事务，跨多个 Mongo 更新仍有部分失败窗口。

### 边界情况

更新 node、workflow、downstream nodes 是多次写，不在 transaction 中；客户端也做了一次乐观 stale 映射，最终仍要以恢复接口为准。

### 面试官可能怎么问

1. `stale` 与 `pending` 为什么要区分？
2. 如何防止旧候选 ID 被选择？
3. 下游清理为什么不能只在前端做？
4. 多次 Mongo 更新中途失败怎么办？
5. 新增节点时需要改哪些位置？

### 我需要补学什么

缓存失效、DAG 依赖、乐观并发控制、版本号/input hash、Mongo transaction。

### 5分钟学习路线

1. 画节点依赖链。
2. 修改 creativeDirection，列出应失效节点。
3. 对照 `downstreamNodeTypes`。
4. 找出服务端候选 ID 校验。
5. 设计 input hash 替代方案。

### 简历候选表达

基于共享节点顺序实现工作流下游结果级联失效，以 `stale` 区分历史结果与未执行状态，并通过 awaiting action、服务端候选集合和评分门槛阻止旧版本选择污染新一轮生成。

### 个人贡献可信度

中到高；V1 当前实现主要来自当前身份，节点状态模型早期也有团队成员贡献。

## 亮点 009：私有对象存储、短期签名 URL 与内容级 PNG 校验

### 推荐等级

A

### 类型

文件安全、对象存储、防御性编程

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          3 |        5 |          4 |        5 |        3 |            3 |        4 |

### 业务场景

候选图、合成图、作品版本存放在 MinIO/S3 私有 bucket，前端需要临时预览和下载。

### 潜在问题

永久公开 URL 会绕过业务权限；只看扩展名/MIME 可上传伪装文件；远程 Provider 返回超大文件会占用内存；下载完整对象只为校验格式浪费带宽。

### 当前实现

数据库保存稳定 objectKey，业务 Service 完成访问校验后生成短期 signed URL；正式下载默认 10 分钟。远程生成图限制 http/https、60 秒 timeout、20MB，并检查 PNG 魔数；合成上传同时校验 multipart 25MB、MIME、文件头、宽高和像素总量。作品导出只 Range 读取前 8 字节并验证 Content-Type + PNG signature。

### 核心源码

文件：`apps/api/src/modules/storage/storage.service.ts`：`getSignedUrl`、`importRemotePng`、`assertAndUploadPng`  
文件：`apps/api/src/modules/works/works.service.ts`：`assertPngExport`

### 技术原理

预签名 URL 通过有限时效授权访问私有对象；魔数验证检查真实文件格式；Range 请求减少格式探测流量；timeout/size limit 限制资源消耗。

### 为什么这样设计

对象权限必须跟随业务资源所有权，而不是依赖一个永久可分享 URL。稳定 objectKey 也避免把过期 signed URL 持久化为事实源。

### 替代方案

由 API 代理下载可隐藏存储地址但增加服务器带宽；CDN signed cookie 适合大量资源。当前方案适合单文件短时访问。

### 边界情况

普通 `assets/upload` 目前只有 `mimetype.startsWith('image/')`，Controller 未设置文件大小 limit，也未检查魔数；上传成功后 Mongo create 失败没有删除对象。该接口不能和严格的 composition 上传混为一谈。`importRemotePng` 允许任意 http/https URL，若来源可控需增加 SSRF 防护和流式大小上限。

### 面试官可能怎么问

1. 为什么数据库不能长期保存 signed URL？
2. MIME、扩展名、魔数分别可信到什么程度？
3. Range 读取为什么能减少开销？
4. 如何防止 SSRF 和无 Content-Length 大响应？
5. 对象上传成功、数据库失败怎么清理？

### 我需要补学什么

S3 presigned URL、私有 bucket、文件魔数、multipart 限制、SSRF、流式下载与背压。

### 5分钟学习路线

1. 解释稳定 key 与临时 URL。
2. 记住 PNG 八字节 signature。
3. 对比 composition 与 asset upload 校验。
4. 说明 Range 请求。
5. 给出 SSRF allowlist/私网 IP 拦截方案。

### 简历候选表达

以私有 MinIO/S3 objectKey 作为持久化事实源，在权限校验后动态签发短期 URL，并对 AI 成片执行超时、体积、PNG 魔数、分辨率和 Range 前缀校验，避免永久 URL 暴露与伪装文件进入作品链路。

### 个人贡献可信度

中。对象存储基础由 lihongzy 等早期贡献；V1 成片与作品的严格校验主要见当前身份后续提交。

## 亮点 010：React ref 管理连接、画布实例与自动保存幂等

### 推荐等级

A

### 类型

React Hooks、资源释放、竞态防护、状态管理

### 评分

| 技术复杂度 | 工程价值 | 面试可讲性 | Bug 防范 | 性能价值 | Agent 相关性 | 简历价值 |
| ---------: | -------: | ---------: | -------: | -------: | -----------: | -------: |
|          4 |        4 |          5 |        5 |        3 |            4 |        4 |

### 业务场景

Workspace 同时管理 SSE、断流恢复 timer、持久化 Zustand、自动保存；ArtTextComposer 管理 Fabric Canvas、绘制中的起点、多个图形对象和异步图片加载。

### 潜在问题

把这些实例放 state 会频繁重渲染且闭包易过期；不 cleanup 会留下网络连接、timer 和 Fabric listener；异步图片加载完成时组件可能已卸载；完成事件重复到达会重复保存作品。

### 当前实现

连接、timer、初始化 Workflow、自动保存 Workflow、Canvas 与 Fabric 对象都放 ref。`recoverRef` 每次 effect 更新为最新函数，SSE error 回调始终调用最新恢复逻辑。Canvas 初始化 effect 使用 `disposed` 抑制卸载后的异步结果，cleanup 调用 `canvas.dispose()`；StaticCanvas 候选预览也释放。Zustand 在 Workspace 中按字段 selector 订阅，避免整个 store 任意字段变化都重渲染页面。

### 核心源码

文件：`apps/web/src/pages/workspace/workspace.tsx`  
文件：`apps/web/src/pages/workspace/components/ArtTextComposer.tsx`

```ts
const recoverRef = useRef<(workflowId: string) => Promise<void>>(async () => undefined)
useEffect(() => {
  recoverRef.current = recover
}, [recover])

return () => {
  disposed = true
  canvas.dispose()
}
```

### 技术原理

ref 在 render 之间保持同一可变容器，但赋值不触发 render，适合 imperative resource 和“最新回调”。effect cleanup 与依赖变化一一对应资源生命周期。

### 为什么这样设计

连接、Canvas 和绘制状态不是需要驱动 React DOM 的声明式数据；放 ref 能减少无关渲染并避免资源被重复创建。

### 替代方案

抽取 `useWorkflowStream`、`useFabricComposer` 自定义 Hook 可进一步隔离职责。当前 Workspace 仍较大，适合后续按资源所有者拆分。

### 边界情况

`BriefReviewPanel` 的 `draft` 只从 props 初始化，Brief 重新生成后未显式同步，可能显示旧草稿；部分 async handler 只靠 React state `loading`，同一渲染帧极快双击仍应由服务端幂等兜底；FlowView 的 requestAnimationFrame 未保存 id/cancel，风险较小但可完善。

### 面试官可能怎么问

1. 为什么 Canvas 实例不放 useState？
2. `recoverRef` 解决了哪类 stale closure？
3. effect cleanup 在 StrictMode 下会怎样？
4. 自动保存 ref 与后端唯一约束分别防什么？
5. props 派生 state 为什么可能过期？

### 我需要补学什么

React render/effect 模型、stale closure、imperative resource、StrictMode、Zustand selector、derived state anti-pattern。

### 5分钟学习路线

1. 分类哪些值需要 render、哪些只需 ref。
2. 画出 recover 回调闭包更新。
3. 检查所有 effect 的创建与 cleanup。
4. 解释 disposed 标志。
5. 找出 Brief draft 同步缺口。

### 简历候选表达

使用 refs 管理 SSE、恢复 timer、Fabric 实例与自动保存幂等键，通过 latest-callback、异步结果抑制和 effect cleanup 避免 stale closure、卸载后更新、重复连接及画布监听泄漏。

### 个人贡献可信度

高。当前 Workspace/Fabric 主链多数提交来自当前 Git 身份。

# Bug Fix / 防御性编程 Top 10

| 排名 | Bug / Root Cause                                                         | Fix / Code                                                                | Git 证据                                          | 面试价值                    |
| ---: | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------- |
|    1 | SSE `event/data` 状态只存在一次 read 内，跨 chunk JSON 与 EOF 尾事件丢失 | 跨 chunk parser + EOF flush + malformed 隔离，`apps/web/src/utils/sse.ts` | 当前未提交 diff；本地 before 4/6、after 6/6       | 极高：网络边界与可复现修复  |
|    2 | 多请求同时启动会重复入队；Redis 失败会留下假 running                     | Mongo 条件原子认领 + Queue add 失败补偿，`WorkflowService.start`          | `272b22f`，并有 3 个 Jest                         | 极高：并发与双写一致性      |
|    3 | Workflow API 曾缺少用户/企业上下文，存在 IDOR 越权                       | Controller 传 `req.user.sub/entId`，Service 统一资源归属检查              | `5365538 fix(api/workflow): ...修复越权漏洞`      | 极高：真实安全 Bug          |
|    4 | Home 已创建 Workflow，Workspace 又自动创建一次                           | 导航携带 workflowId、Store 持久化并连接既有任务                           | `67043ac` 提交说明明确“重复创建工作流”            | 高：React effect 与业务幂等 |
|    5 | 图像节点已完成但 UI 仍显示 loading                                       | loading 与节点状态/执行态绑定，不再因图片 URL 条件误判                    | `a90b0f0` 明确修复标题                            | 中高：派生状态 Bug          |
|    6 | LangGraph reducer 已累加 retryCount，节点又返回累计值导致重复计数        | 节点只返回增量 1，终态经 finishNode                                       | `879b273`                                         | 高：状态 reducer 语义       |
|    7 | 评估异常却标记 running，路由继续重试，fallback 与真实失败不一致          | catch 写 failed/error，条件路由短路，finish 保留失败                      | `4651c4b`                                         | 高：错误不能伪装成低分      |
|    8 | LLM/BrandService 模块加载或调用崩溃、外部服务不稳定                      | 懒加载/稳定性修复与统一 Provider 配置                                     | `fe3a425`、`c4cf849`、`9b78e2f`；当前旧链价值有限 | 中：需先补学历史上下文      |
|    9 | 个人空间只按 `spaceId='personal'` 查询会混合不同用户                     | 个人知识库/作品查询额外带 `creatorId`                                     | `3bb2b81`、`272b22f` 与当前源码                   | 极高：多租户隔离            |
|   10 | Fabric/连接/Timer 未释放会重复监听或更新卸载组件                         | `canvas.dispose()`、SSE abort/close、clearTimeout、disposed flag          | 当前源码，部分来自 `5f662b4/96c63c4`              | 高：小而高级的生命周期代码  |

说明：第 8 项的旧 LangGraph 并非当前 V1 主链，适合作为“历史 Bug 学习案例”，不建议作为当前核心架构成果。

# 性能优化 Top 10

| 排名 | 优化前瓶颈                                    | 当前实现                                        | 理论/实测收益                                                                                  | Benchmark 证据                               |
| ---: | --------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
|    1 | 非流式 UI 直到完整 Agent 结束才显示           | fetch SSE 在首个有效事件就更新 UI               | 本地 4/8/12s Mock：median 首内容 466.23/615.37/770.63ms，相对整包等待降低 88.44%/92.33%/93.59% | Level B，3 warm-up + 20 runs；非生产         |
|    2 | N 个私有素材签名 URL 串行累加延迟             | `Promise.all(attachSignedUrl)`                  | 20 个、50ms±10ms Mock：median 1136.09ms → 66.60ms，降低 94.14%；limit=5 为 242.47ms            | Level B；真实 Service + Mock Storage         |
|    3 | 生图质检失败导致再次调用付费生图              | 生成检查点 + 重跑只评估                         | 可避免重复外部生成调用                                                                         | 无真实费用/耗时 Benchmark，禁止量化          |
|    4 | 四候选图对象上传串行                          | `Promise.all` 并行导入                          | 理论上接近最慢单个上传，而非时延求和                                                           | 无真实 MinIO Benchmark；并发无上限有压力风险 |
|    5 | Sharp 先后解码底图与成片                      | `Promise.all` 并行 decode                       | 两个独立 CPU/IO 操作可重叠                                                                     | 无 benchmark；32MP 仍可能 CPU 重             |
|    6 | 每个状态字段变化导致 Workspace 订阅整个 store | Zustand 按字段 selector                         | 减少无关 store 更新导致的 render                                                               | 无 React Profiler 证据                       |
|    7 | Fabric 高频指针移动驱动 React/Zustand         | Canvas/ref 内更新 Rect，只在区域同步点 setState | 避免每个 mousemove 重渲染整页                                                                  | 无 FPS/Long Task 证据                        |
|    8 | 布局切换后同步 fitView 可能拿到旧布局         | `requestAnimationFrame` 下一帧 fitView          | 避开当前 commit 的布局测量时机                                                                 | 无帧率 benchmark；属于正确性兼性能           |
|    9 | 导出校验下载完整对象                          | S3 Range 只读前 8 bytes                         | PNG 探测数据量从完整图片降为 8 字节加协议开销                                                  | 无网络 benchmark，但复杂度明确               |
|   10 | 品牌约束无限读取导致 Prompt 和查询膨胀        | active 过滤并 `.limit(30)`                      | 对查询结果和 Prompt 上下文设置上界                                                             | 无质量/延迟 benchmark，可能截断重要规则      |

Benchmark 限定：运行环境 Windows 10.0.26200、i7-14650HX、Node 22.19.0；commit 基点 `272b22f`，运行时工作树 dirty；未连接真实模型、Mongo、Redis、MinIO、企业网络或浏览器。除前三个本地案例外，无法从仓库证明具体性能提升数字。

# React高级实践

## 有价值

- `connectionRef/recoveryTimerRef/initializedWorkflowRef/autoSaveWorkflowRef`：分别管理资源、恢复去重、初始化去重和副作用幂等，不是为了逃避渲染而滥用 ref。
- `recoverRef.current = recover`：解决 SSE error 回调的 stale closure。
- `ArtTextComposer` 的 `disposed` + `canvas.dispose()`：防止异步底图加载后更新已销毁 Canvas，并释放 Fabric listeners/resources。
- Zustand 按字段 selector：Workspace 没有一次性解构整个 Store，订阅粒度合理。
- `finally` 恢复导出前隐藏的辅助框：即使 dataURL/blob 失败，也不让编辑器 UI 永久丢失框线。
- Async panel 的 loading/disabled/finally：提供基本重复提交防护和可靠恢复。

## 不足与风险

- `BriefReviewPanel` 的 draft 没有随 `brief` props 更新，重新生成 Brief 后可能显示旧值。
- `CreativeDirectionPanel` 用 key 强制重建规避本地选择同步，能工作但应明确这是受控版本切换策略。
- FlowView 的 `requestAnimationFrame` 未 cancel；组件立即卸载时仍可能调用 fitView。
- 多个 handler 仍未统一 catch/用户提示，部分错误依赖 Axios 全局 toast。
- 没有 Error Boundary；Fabric/React Flow 渲染异常可能影响整个 Workspace。

# 异步与并发控制

## 已有

- Workflow 启动原子认领和 Queue 失败补偿。
- SSE 旧连接关闭、Abort、断流恢复 timer 去重。
- Worker 节点级 retry，限定可重试错误并短退避。
- 生图/签名 URL/对象补偿/Sharp decode 的 Promise.all。
- 自动保存前端 ref 去重 + 后端唯一约束/duplicate key 回读。
- `awaiting_user` 检查点把长异步链拆为可恢复阶段。

## 需要补强

- `runNode` 和 `queueNode` 入队失败未回滚 Workflow/Node 状态。
- retry 分类依赖 error message 正则，且无指数退避、jitter、Retry-After、熔断或全局预算。
- 并行签名/上传没有并发上限；大量素材下可能压垮下游。
- SSE 没有 event sequence/id，重复事件与乱序事件主要靠最终 recover，而非显式去重。
- 没有 AbortController 取消普通页面列表请求；快速切换 space 时可能有旧请求覆盖新状态的风险。

# 状态管理亮点

- 服务端状态是 Workflow/Node/Revision Mongo 文档；实时 SSE 只做投影，避免把连接当事实源。
- `WorkflowStatus` 与 `WorkflowAwaitingAction` 是显式协议，能表达 running 与等待人工操作。
- `stale` 节点状态解决“历史结果存在但不再属于当前输入版本”的语义。
- Zustand persist 支持刷新后恢复 workflowId/prompt/result；页面仍调用详情接口校准服务端真相。
- Store updater 支持值或函数，处理连续 SSE 事件时不会使用过期 state。
- 当前 persist 没有 version/migrate/partialize，未来契约变更可能让旧 localStorage 结构污染页面；这是需要补齐的兼容点。

# 架构设计亮点

1. 共享契约包：节点名、状态、SSE event、合成类型只定义一次，Web/API/Agent 同步消费。
2. 稳定公共出口：Agent 通过 `src/index.ts` 导出，API 不跨包访问内部目录。
3. API/Agent 分界：Prompt 与模型逻辑在 Agent，权限/持久化/队列在 API。
4. 状态机 + 检查点：比 Controller 中串行大函数更易恢复和重跑。
5. 受控 AI + 确定性渲染：模型只给参数，Fabric 输出最终文字，降低黑盒风险。
6. Object key 作为事实源：signed URL 是读时派生，不把临时能力写进长期状态。
7. 兼容层：`normalizeWorkflowNodeType` 支持旧节点名迁移到七节点协议。

开闭性评价：新增普通串行节点仍需更新 `WORKFLOW_NODE_ORDER`、标签、结果契约、Processor execute 分支和 Web inspector，并非完全插件化；但状态、下游失效和 SSE 类型能从共享契约统一派生，优于散落字符串。当前不适合包装成“插件系统”。

# AI / Agent 技术亮点

| 方向                     | 结论             | 技术含量判断                                                                                       |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------------------- |
| 1. SSE 流式处理          | 强               | 自定义鉴权 stream、chunk parser、abort、恢复；S 级                                                 |
| 2. Agent 消息/节点状态机 | 强               | 七节点持久化状态 + awaiting_user + stale；S 级                                                     |
| 3. Tool Calling          | 无               | 未发现 tool call event、tool registry、toolId/toolName UI；不要写                                  |
| 4. MCP                   | 无               | 未发现 MCP 协议或客户端；不要写                                                                    |
| 5. RAG                   | 部分             | Pinecone ingest/search 代码存在，但 V1 默认禁用，主链直接读取 Mongo 品牌约束；只能写“可选检索能力” |
| 6. Structured Output     | 强               | JSON mode + 多层语义校验 + fallback/throw；A 级                                                    |
| 7. partial JSON          | 无               | SSE data 是完整 JSON event；没有 LLM token partial JSON parser；不要写                             |
| 8. Workspace             | 强但非文件 Agent | React Flow 工作流 + Fabric 合成；没有 Agent 修改文件/Monaco/dirty file conflict                    |
| 9. Prompt                | 中强             | Brief/方向/Prompt/艺术字/评估分层，约束生成目标；缺少系统化 prompt eval 数据集                     |
| 10. 错误恢复             | 强               | retry、checkpoint、SSE recover、rerun、补偿删除；仍缺统一错误码和回滚覆盖                          |

关于旧 `packages/agent/src/ai-logic/graph.ts`：它有 retry/finish/failure-short-circuit 的真实修复历史，但当前仍大量 `any`、旧状态名和格式风格，也未被 V1 Processor 主链使用。面试中应讲“历史演进与踩坑”，不应说当前所有工作流都由 LangGraph 驱动。

# 文件与安全

## 已有防护

- 全局 ValidationPipe `whitelist + transform`，DTO 对输入枚举、数组长度、坐标、尺寸做校验。
- Composition：25MB、PNG MIME、魔数、尺寸、32MP、图层、像素区域、可信来源。
- Storage：必填配置 fail-fast、短期 URL、远程图 timeout 与 20MB 声明大小限制。
- Works：可信 Workflow/creator/Space/质检/objectKey 校验，导出记录与安全文件名。
- Assets/Knowledge/Workflow：从 JWT `req.user` 获取用户和企业上下文，不信任客户端 userId。

## 重要缺口

1. `assets/upload` 的 FileInterceptor 没有 fileSize limit，Service 只检查 MIME 前缀，没有魔数/真实解码。
2. Asset 对象先上传再写 Mongo，Mongo 失败时未补偿删除。
3. `StorageService.importRemotePng` 允许任意 http/https URL；若来源能被攻击者影响，存在 SSRF 风险。
4. 没有 Content-Length 时仍一次性 `arrayBuffer()`，20MB 限制只能在下载后通过最终 buffer 间接发现，内存峰值不可控。
5. SSE 服务端权限验证异步执行，但 QueueEvents listener 同步注册，需先鉴权再订阅。
6. JWT 放 localStorage，需考虑 XSS；仓库没有 CSP/Refresh Token/Token rotation 证据。
7. CORS 直接 `enableCors()`，生产应配置 allowlist。

# Git历史发现

## 高价值提交

| Commit                | 作者             | 证据                                                  |
| --------------------- | ---------------- | ----------------------------------------------------- |
| `272b22f`             | yiheng-web       | 原子启动、Queue 失败回滚、作品个人隔离与可信来源      |
| `f5188cd`             | FunEnn           | SSE 协议重构、生图重跑缓存控制                        |
| `5365538`             | FunEnn           | Workflow 权限上下文隔离，提交标题明确“修复越权漏洞”   |
| `67043ac`             | yhanli4806-coder | 提交正文明确重复创建、底图预览、状态持久化三个问题    |
| `879b273`             | ycy18            | retry reducer 计数、finish 终态、品牌上下文与错误传递 |
| `4651c4b`             | ycy18            | 评估异常由 running 改 failed，条件路由短路失败        |
| `a90b0f0`             | pumpkynn         | 图像生成完成后仍显示 loading                          |
| `5f662b4`             | yiheng-web       | V1 艺术字合成闭环                                     |
| `3bb2b81`             | yiheng-web       | 个人/团队/企业知识库权限与错误处理                    |
| `8a5869e` / `220b9f4` | lihongzy         | 文件上传、签名访问、MinIO/S3 基础                     |

## 历史解读原则

- Commit 标题只能证明修改意图，最终结论仍以当前源码为准。
- 多个早期修复发生在旧工作流/旧 UI，不能直接说当前同一代码仍由该 Commit 实现。
- 当前未提交 SSE/Benchmark 改动没有 commit/blame 归属，只能按当前 Git 身份给“高但未提交”的可信度。

# 项目技术亮点候选池

| 候选                           | 等级 | 是否建议简历 | 备注                               |
| ------------------------------ | ---- | ------------ | ---------------------------------- |
| SSE chunk/EOF/abort/recover    | S    | 是           | 最强前端/Agent 流式案例            |
| 七节点持久化 Human-in-the-loop | S    | 是           | 最强全栈架构案例                   |
| 原子启动与 Queue 回滚          | S    | 是           | 最强并发一致性案例                 |
| 付费生图 checkpoint            | S    | 是           | 最强 AI 产品化案例                 |
| Fabric + 像素完整性验证        | S    | 是           | 最强复杂交互/安全案例              |
| 可信作品与个人隔离             | S    | 是           | 最强多租户案例                     |
| LLM 结构化输出校验             | A    | 是           | 适合 Agent 岗                      |
| stale 下游失效                 | A    | 是           | 适合状态管理追问                   |
| 私有对象 + signed URL          | A    | 是           | 需同时讲清普通 Asset 上传缺口      |
| refs/resource cleanup          | A    | 是           | 作为前端小而高级案例               |
| Promise.all 签名聚合           | A    | 有限定地写   | 可使用本地 Level B 数字            |
| RAG/Pinecone                   | B    | 谨慎         | 默认禁用，不能说 V1 已在用语义检索 |
| 旧 LangGraph                   | B/C  | 不作为主亮点 | `any` 多、非 V1 主链               |
| React Flow                     | B    | 单独不写     | 用库不是亮点，需结合状态投影       |
| Ant Design/Zustand             | C    | 不单独写     | 常规技术选型                       |

# 我的贡献可信度分析

## 高

- `272b22f` 的原子启动、队列失败补偿、作品隔离；作者/提交者与当前 Git 身份一致。
- `5f662b4`、`96c63c4` 的 V1 合成与工作流交互；作者与当前 Git 身份一致。
- `3bb2b81` 的知识库空间权限；作者与当前 Git 身份一致。
- 当前未提交 SSE parser/Benchmark：工作树与当前身份一致，但尚无 commit 证明，正式投递简历前建议提交并保留测试证据。

## 中

- 整体 Workflow/SSE/BullMQ 基础：早期由 FunEnn、lihongzy 等共同建设，当前身份进行了较大幅 V1 演进。
- MinIO/S3 基础：主要由 lihongzy 贡献，当前身份在其上增加可信作品和严格合成校验。

## 低

- 旧 LangGraph retry/failure 修复主要由 ycy18 完成。
- 重复创建工作流的早期修复主要由 yhanli4806-coder 完成。
- 图像 loading 早期修复由 pumpkynn 完成。

简历写法建议：高可信项可用“设计/实现/修复”；中可信项用“参与演进/基于现有基础完善”；低可信项只放项目技术亮点候选池或学习案例，不写成个人独立成果。

# 不建议写入简历的内容

- “使用 React 19 / NestJS / Zustand / Ant Design / React Flow”——仅列技术栈没有工程问题与结果。
- “基于 LangGraph 构建当前 V1 全链路”——不准确；当前 V1 主链由 BullMQ Processor 编排。
- “实现 MCP/Tool Calling/partial JSON”——源码不存在。
- “实现生产级 RAG”——V1 默认禁用向量模式，主链直接读 Mongo 约束。
- “SSE 完全符合规范/零丢包”——只覆盖六个确定性边界用例，没有生产网络统计。
- “性能提升 90%+”而不带本地 Mock 限定——Benchmark 不是生产数据。
- “文件上传安全完善”——composition 严格，但普通 Asset 上传仍有明显缺口。
- “全仓强类型”——旧 graph.ts 有大量 `any`，部分前端也有历史断言。
- “完整 E2E 通过”——本次没有真实浏览器、Fabric、模型、Redis/Mongo/MinIO 联调。
- “独立完成全部架构”——Git 历史显示多人共同贡献。

# 面试高频追问

1. SSE 为什么会跨 chunk 丢事件？如何写确定性测试？
2. 为什么标准 EventSource 不适合 Bearer Token？
3. SSE 断流恢复时，数据库、队列事件和前端 store 谁是真相？
4. 多标签页重复启动如何在服务端保证只有一个任务？
5. Mongo 状态更新和 BullMQ add 之间如何处理双写一致性？
6. 为什么 AI 工作流需要 `awaiting_user`，怎样刷新恢复？
7. 修改上游节点后，为什么下游是 stale 而不是 pending？
8. 质检失败时如何避免重复付费生图？
9. Promise.all 部分失败时如何补偿已经上传的对象？
10. 模型返回 JSON 后做了哪些运行时与语义校验？
11. 为什么艺术字不让模型直接输出 SVG/HTML？
12. Fabric 显示坐标如何映射到原图像素？
13. 如何验证客户端上传的最终 PNG 没有替换底图？
14. signed URL 为什么不应长期写入数据库？
15. Space 可访问为什么不代表 Space 中所有作品可访问？
16. `useRef` 在连接、timer、Canvas、自动保存中分别解决什么？
17. 当前最严重的三个工程缺口是什么，如何按优先级修？
18. 本地 Benchmark 为什么只是 Level B，怎样升级到生产 Level A？

# 我的补学清单

## P0：写进简历前必须掌握

- SSE wire format、TCP chunk、UTF-8 streaming decode、AbortController。
- Mongo 条件原子更新、幂等键、BullMQ jobId、至少一次投递。
- 状态机、checkpoint、Human-in-the-loop、stale/invalidation。
- S3/MinIO object key、presigned URL、跨存储补偿事务。
- Fabric 坐标系、缩放/旋转包围盒、PNG 魔数与 Sharp raw pixels。
- LLM 输出不可信、JSON Schema/Zod、字段/值域/集合/跨字段校验。

## P1：面试深入追问

- Outbox pattern、Saga、DLQ、指数退避/抖动/熔断。
- SSE Last-Event-ID、事件序号、幂等消费、乱序/重复事件处理。
- 多租户 IDOR、RBAC/ACL、CORS/CSP、localStorage Token 风险。
- Node/浏览器流背压、流式大小限制、SSRF 防护。
- React StrictMode、stale closure、受控/非受控状态、Error Boundary。

## P2：项目下一步改进

- 先鉴权后注册 SSE listener，并加入 event sequence。
- 为所有 Queue add 路径增加原子认领/失败回滚或 outbox。
- 为 Assets upload 加 25MB、白名单、魔数/Sharp decode 和对象补偿。
- 把 Agent 手写校验迁移到共享 Zod/JSON Schema。
- 给 Zustand persist 加 version/migrate/partialize。
- 用并发池替代无上限 Promise.all，并做真实 MinIO/Provider Benchmark。
- 增加浏览器 E2E：刷新恢复、快速切 Space、停止流、Fabric 导出、字体差异。

# 最值得写入简历的 8 个技术亮点

1. **Agent SSE 健壮性**：实现 JWT fetch-stream 客户端，处理跨 chunk/UTF-8/EOF、非法事件、Abort 与断流恢复；本地确定性用例 4/6 → 6/6。
2. **可恢复 AI 工作流**：MongoDB + BullMQ + SSE 七节点状态机，三处 Human-in-the-loop 检查点支持刷新恢复和节点重跑。
3. **并发启动幂等**：Mongo 条件原子认领 + BullMQ jobId + Queue 失败补偿，Jest 覆盖并发、重复调用和 Redis 不可用。
4. **AI 成本与容错**：四候选付费生图落盘 checkpoint，视觉质检失败复用候选，只重跑评估；部分上传失败执行补偿删除。
5. **可控图文合成**：LLM 输出受控艺术字参数，Fabric 确定性渲染，服务端校验版本、图层、PNG、尺寸及框内/框外像素差。
6. **可信作品与租户隔离**：从服务端 Workflow 重新推导成片来源，按 creator/Space/object namespace 校验，并用唯一约束和补偿清理保证自动保存幂等。
7. **Structured Output 防御**：对 Brief、创意方向、评分和艺术字执行字段、范围、ID 归属、全局唯一性和文本一致性校验。
8. **私有资产交付**：稳定 objectKey + 读时短期 signed URL，成片导出用 Range + PNG signature 验证；量化签名 URL 并发聚合时必须注明本地 Mock。

## 推荐的一页简历组合

若目标是前端/Agent 全栈实习，建议只放 3～4 条：

- SSE chunk/EOF/Abort/recover；
- 七节点 Human-in-the-loop 工作流；
- Fabric 确定性合成 + 服务端像素校验；
- 原子启动或付费生图 checkpoint（二选一，视岗位侧重）。

量化数据可写，但必须保留：`本地 Mock Agent 流`、`3 次预热 + 20 次有效运行`、`非生产监控`。最安全的量化表达是：

> 在本地确定性 SSE 分片基准中修复跨 chunk 与 EOF 丢事件，使 6 类边界用例由 4/6 提升至 6/6；在 100 个已建立连接的随机停止场景中，关闭后业务回调为 0 次。

# 审计验证记录

本次审计结束前实际执行：

- `pnpm.cmd --filter @brand-flow/contracts test`：通过，8/8。
- `pnpm.cmd --filter @brand-flow/agent test`：通过，22/22；命令包含 Agent build。
- `pnpm.cmd --filter @brand-flow/web test`：通过，Node test 1/1，Vitest 6 files/10 tests。
- `apps/api/.\node_modules\.bin\jest.cmd --runInBand`：通过，4 suites/22 tests。
- `git diff --check -- resume_technical_audit.md`：通过。

API 首次尝试 `pnpm.cmd --filter @brand-flow/api test -- --runInBand` 时，pnpm 把 `--` 也传给 Jest，Jest 将 `--runInBand` 解释成文件匹配 pattern，因而报告 `No tests found`；随后进入 `apps/api` 直接运行 Jest，确认真实测试通过。该命令问题不计为项目测试失败。

未执行：真实浏览器交互、React Profiler、Fabric 字体/导出 E2E、真实注册登录链路、MongoDB/Redis/BullMQ/MinIO 集成、真实 SiliconFlow/Pinecone 调用、生产网络与线上性能监控。因此测试通过只证明现有自动化范围，不代表完整业务验收。
