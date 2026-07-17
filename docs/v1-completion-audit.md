# Brand-Flow AI V1.0 完成度审计

> 审计日期：2026-07-16  
> 分支：`codex/UI`  
> 判断优先级：当前可运行代码 > UI 重构文档 > V1 节点文档 > 早期计划文档

## 1. 当前实际架构

- Monorepo 使用 pnpm workspace 与 Turborepo。
- `apps/web` 是 React 19 + Vite + Zustand + Ant Design + React Flow 前端。
- `apps/api` 是 NestJS + Mongoose + BullMQ 后端，依赖 MongoDB、Redis 和 MinIO。
- `packages/agent` 是 LangChain/LangGraph 库，由 API 进程加载，不单独提供 HTTP 服务。
- V1 共享业务契约已收敛到 `packages/contracts`，Web、API、Agent 通过 workspace 依赖复用。

## 2. 已完成功能

- 注册、登录、JWT Guard 和基础用户资料接口已存在。
- 个人、团队、企业 Space 的列表与切换接口已存在。
- 知识库、知识项 CRUD 与 Pinecone 写入入口已存在。
- 素材上传、对象存储、列表、删除和素材转知识项后端接口已存在。
- Workflow 创建、查询、BullMQ 执行、SSE 订阅、节点修改和重跑骨架已存在。
- 作品、作品版本、正式导出后端接口已存在。
- `codex/UI` 已建立设计 Token、应用壳层、Workspace 三栏结构与基础可访问性规则。

## 3. 部分完成功能

- Workflow 能运行，但审计时仍是旧六节点 Graph，且评估对象是 Prompt，不是最终成片。
- `generateFourCandidates`、候选评分和最终质检函数已存在，但未接入主 Graph。
- Workspace 能恢复状态和重连 SSE，但把 `stale` 映射为完成态，且缺少创意方案节点。
- 作品后端可保存初始版本并导出，但 Web 无作品 API、列表、详情和保存入口。
- 品牌资产后端接口较完整，但 `/brand` 页面仍使用 TODO 和前端内存行为。
- 首页 Space 可选择，但没有真实知识库多选，且展示了无来源的快捷卡片和额度。

## 4. 完全缺失功能

- 七节点统一契约在三层的真实落地。
- 用户可操作的四候选图评分、选择、合成/跳过和最终质检闭环。
- Web 作品中心、作品详情、正式导出入口。
- Web 统一 `LoadingState`、`ErrorState`、`EmptyState`、`AsyncButton`、`ConfirmAction`。
- Web 与 Agent 的单元测试配置及核心业务测试。
- 1024×768、1280×800、1440×900 三档浏览器验收截图。

## 5. 前后端契约冲突

- 文档要求七节点 `brief/brandConstraint/creativeDirection/prompt/generate/compose/finalEvaluation`；审计时 API Schema 与 Web Store 使用六个旧节点名。
- 创建 Workflow 的 Web 类型声明了 `selectedKnowledgeBaseIds`，API DTO 却只接收单个 `knowledgeId`，全局 ValidationPipe 会移除未声明字段。
- SSE 缺少统一时间戳、`node_queued`、结构化错误和稳定 `nodeId`。
- API 的 `node_completed` 使用 `data`，冻结契约使用 `output`；前端也复制了一套不完整事件类型。
- `skipped` 和 `stale` 在恢复逻辑中被当作 `done`，语义丢失。

## 6. Agent 与 Workflow 冲突

- Agent Graph 是 `intentNode → knowledgeNode → promptNode → generateNode → evaluateNode → finishNode`，缺少创意方案和真实合成。
- Processor 把 `workflow.spaceId` 写入 `enterpriseId`，会导致个人/团队/企业上下文混用。
- Graph 普通生成只调用 `executeGenerate`，未调用已存在的四图方法。
- 候选评分与最终图质检函数未被 Graph 或 Processor 调用。
- 单节点重跑只跳过上游，没有统一将下游标记为 `stale`，也没有幂等 jobId。

## 7. 数据模型问题

- Knowledge、Asset、Work、ExportLog 强制 `enterpriseId: ObjectId`，新注册用户的个人空间没有 enterpriseId 时不可用。
- Knowledge 和 Asset 没有统一 `spaceId/spaceType`，只能按企业过滤，无法表达个人与团队的严格归属。
- Work 缺少直接 `spaceId`、`coverImageUrl`、`selectedCandidateId` 字段，主要信息藏在 metadata。
- Workflow 没有保存 `selectedKnowledgeBaseIds`、`spaceType`、最终候选选择和恢复游标。

## 8. 安全和权限问题

- Workflow 只检查 enterpriseId 和 personal userId，未验证团队/企业 Space 的真实成员关系。
- 创建 Workflow 未校验 Space 归属，也未校验最多 3 个知识库及其 Space 归属。
- 素材删除先按 ID 查询，虽然随后检查权限，但错误语义可能暴露资源是否存在。
- JWT 缺失配置时回退到 `default_secret`，不适合生产环境。
- CORS 当前全开放；生产部署应配置允许源。

## 9. P0 / P1 / P2 优先级

### P0

1. 统一七节点、状态和 SSE 契约。
2. 修复 Space 权限与个人空间数据模型。
3. 接通四候选图、评分、合成/跳过和最终质检。
4. 接通作品保存、列表、详情和正式导出。
5. 首页多知识库、Workspace 真实状态、候选选择和失败恢复。
6. 为上述链路补单元与集成测试。

### P1

1. 品牌资产页面接真实上传/列表/删除/转知识项接口。
2. 统一异步状态组件、路由懒加载和主包拆分。
3. 补浏览器三档回归、键盘与控制台检查。

### P2

1. 费用与 Token 精确统计。
2. 高级执行日志、复杂历史与撤销/重做。
3. 更完整的企业审批、强制品牌策略和模板市场。

## 10. V1 最小可交付范围

登录后选择真实 Space 与 0～3 个知识库，创建七节点 Workflow；SSE 正确展示排队、运行、完成、跳过、失败和失效状态；生成四候选图并评分；可选择候选图；自动合成或跳过；对最终成片质检；保存为作品并产生初始版本；在作品中心查看详情、版本并通过正式接口导出 PNG。

模型或生图服务不可用时，只允许通过 `BRAND_FLOW_DEMO_MODE=true` 显式进入演示模式，并在 Web 显示标识。默认仍走真实 Provider。

## 11. 建议实施顺序

1. 共享契约与测试工具。
2. Agent 七节点能力和结构化 fallback。
3. API Schema、Space 校验、Processor、SSE 与重跑。
4. 作品与个人 Space 模型修正。
5. 首页、Workspace、作品页和品牌资产页。
6. 单测、集成测试、构建、启动和浏览器验收。

## 12. 明确不纳入 V1 的功能

- Fabric.js 复杂局部修图和 PS 级图层系统。
- 多人实时协作、版本合并与完整撤销/重做历史。
- 自动无限回溯；V1 自动重试最多 2 次。
- 复杂模板市场、企业审批流、完整计费和视频导出。
