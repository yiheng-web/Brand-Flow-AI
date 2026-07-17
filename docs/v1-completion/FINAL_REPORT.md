# Brand-Flow AI V1.0 实施与验收报告

> 日期：2026-07-16  
> 分支：`codex/UI`  
> 结论：核心创作与作品闭环已形成可运行的演示路径，但仍有 P0 缺口，当前不能标记为 V1.0 全量验收完成。

## 1. 完成的功能

- 新增 `@brand-flow/contracts`，统一七节点、节点状态、SSE、CreativeBrief、品牌约束、创意方案、PromptPlan、候选图、候选评分和最终质检类型。
- Workflow 创建时初始化七节点，支持 0～3 个知识库 ID 校验、Space 成员校验、BullMQ 幂等任务 ID、节点重跑和下游 stale。
- SSE 支持 `workflow_started`、`node_queued`、`node_started`、`node_completed`、`node_skipped`、`node_failed`、`workflow_completed`、`workflow_failed`。
- Agent 支持 CreativeBrief 结构化 fallback、三个差异创意方向、PromptPlan、四候选图、候选评分降级、Compose skipped/自动基础合成和最终图视觉质检入口。
- `BRAND_FLOW_DEMO_MODE=true` 时使用与真实 Provider 相同的返回契约；Web 使用 `VITE_BRAND_FLOW_DEMO_MODE=true` 显示演示标识。
- Workspace 展示七节点及 queued/running/completed/skipped/failed/stale 状态，可恢复、重连、选择候选图、从节点重跑、保存作品和正式导出。
- 作品保存自动创建初始版本；新增作品列表、详情、版本展示、删除和正式导出页面。
- 首页新增 0～3 个知识库选择，创建 Workflow 时传递真实 Space 和知识库 ID。
- 品牌资产页挂载真实列表和删除 API；移除列表的前端静态空数据行为。
- 增加统一 Loading、Empty、Error 和 AsyncButton 基础组件。
- Workspace、Knowledge、Brand、Works、Profile 使用路由级懒加载。

## 2. 架构修改

- 共享契约：`packages/contracts`。
- Agent V1 能力：`packages/agent/src/v1-workflow.ts`。
- API Workflow Processor 从旧 LangGraph 六节点适配器升级为显式七节点业务编排。
- Work 增加 `spaceId`、`spaceType`、`selectedCandidateId`，`enterpriseId` 对个人 Space 改为可选。
- ExportLog 增加 `spaceId`，允许记录个人 Space 导出。
- Web Workflow Store 直接保存共享 `WorkflowResult`，不再复制旧六节点 AgentState。

## 3. 七节点实际执行流程

```text
brief
→ brandConstraint
→ creativeDirection（固定三个差异方向，默认选择首个）
→ prompt
→ generate（固定四候选 + 每图评分 + 默认最高分）
→ compose（needsComposition=false 时 skipped，否则基础自动合成）
→ finalEvaluation（对最终图 URL 执行质检）
```

用户可在生成后选择另一候选图；选择会保留上游结果，把 Compose 与 FinalEvaluation 标记 stale，并可从 Compose 继续运行。

## 4. API 契约列表

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/org/spaces`
- `POST /api/workflow/create`
- `GET /api/workflow/:id`
- `GET /api/workflow/:id/stream`
- `PUT /api/workflow/:id/nodes/:nodeType`
- `POST /api/workflow/:id/nodes/:nodeType/run`
- `POST /api/works`
- `GET /api/works?spaceId=...`
- `GET /api/works/:id`
- `DELETE /api/works/:id`
- `POST /api/works/:id/versions`
- `GET /api/works/:id/versions`
- `POST /api/works/:id/export`
- 知识库与素材原有 CRUD 路由保持不变。

## 5. 数据模型变化

- Workflow：新增 `spaceType`、`selectedKnowledgeBaseIds`、`retryCount`。
- WorkflowNode：节点枚举升级为七节点，新增 queued 和结构化 error。
- Work：新增 `spaceId`、`spaceType`、`selectedCandidateId`；个人 Space 不再要求 enterpriseId。
- ExportLog：新增 spaceId；enterpriseId 可选。

现有旧六节点数据通过共享契约中的旧节点名映射读取；新 Workflow 只写入七节点契约。

## 6. 新增环境变量

- `BRAND_FLOW_DEMO_MODE`
- `VITE_BRAND_FLOW_DEMO_MODE`
- `IMAGE_GENERATION_TIMEOUT_MS`

同时补齐 OpenAI、Pinecone、图片 Provider、MongoDB、Redis 和 MinIO 示例配置，并移除了示例文件中的固定密码。

## 7. 新增依赖及原因

- 未新增外部运行时依赖。
- 新增 workspace 内部包 `@brand-flow/contracts`，用于三层共享类型和纯函数。
- pnpm 锁文件仅增加该 workspace 包的链接关系。

## 8. 测试结果

- `pnpm install`：成功；按锁文件安装，pnpm 继续按安全策略忽略仓库原有原生包构建脚本。
- `pnpm build`：通过，4 个 workspace 全部构建成功。
- `pnpm test`：通过，共 19 项测试（contracts 4、Agent 3、API 11、Web 1）。
- `pnpm --filter @brand-flow/web lint`：通过。
- `pnpm --filter @brand-flow/contracts lint`：通过。
- `pnpm lint`：未通过。Agent 旧文件 365 项、API 旧文件 236 项存量问题，主要是仓库 Prettier 风格不一致和历史 `any`；本次没有通过大范围格式化旧文件掩盖该问题。
- `git diff --check`：通过，仅提示 Windows 后续可能转换 LF/CRLF。

真实 HTTP 演示冒烟结果：

```text
注册/登录：成功
个人 Space 创建 Workflow：成功
七节点：7 个
候选图：4 张
Compose：skipped
最终质检：86 分
保存作品：成功
初始版本：1 个
作品列表：可查询
正式导出接口：成功返回文件名与下载 URL
Demo 候选 MIME：data:image/png
```

## 9. 浏览器回归结果

- Web 开发服务可启动，实际监听过 `http://localhost:5174/`，HTTP 返回 200。
- API 可启动，`GET http://localhost:3000/api` 返回 200。
- MongoDB、Redis、MinIO 和 MinIO 初始化容器启动成功。
- 当前会话没有暴露浏览器技能要求的控制运行接口，因此未执行 1024×768、1280×800、1440×900 的真实点击、控制台检查和截图。
- `docs/v1-completion/screenshots/` 未放置伪造截图。

## 10. 已知问题

1. Knowledge 与 Asset 仍使用旧 enterpriseId 强制模型；个人 Space 的知识库创建、素材上传和素材转知识项尚未完成数据迁移。
2. `needsComposition=true` 的基础自动合成结果当前是 SVG Data URL；正式 PNG 栅格化与对象存储落盘尚未完成。
3. Workflow 当前先按最高分候选完成一次闭环，用户改选后再从 Compose 重跑；尚未实现“执行暂停并强制等待选择”的状态。
4. 品牌资产上传和素材转知识项弹窗仍有旧 TODO，列表和删除已接真实接口。
5. API/Agent 存量 lint 未清零。
6. 缺少完整注册→知识库→Workflow→SSE→作品→导出的自动化集成测试与浏览器测试。
7. JWT 未配置时仍存在旧 `default_secret` 回退，应在生产部署前改为启动失败。

## 11. 未纳入 V1 的功能

- Fabric.js 复杂局部修图。
- 多人实时协作与版本合并。
- 完整撤销/重做历史。
- 精确 Token/费用核算。
- 模板市场、企业审批流和视频导出。

## 12. V1.1 建议

1. 先完成 Knowledge/Asset 的统一 SpaceScope 数据迁移与权限服务。
2. 增加服务端 PNG 合成与对象存储落盘，导出只允许已保存版本。
3. 增加 `awaiting_candidate_selection` 工作流状态，候选选择后再继续 Compose。
4. 建立 API/Agent lint 基线清理 PR，避免和功能改动混合。
5. 补 Playwright 三档截图、键盘与网络失败回归。

## 13. Git 提交列表

本次未执行 Git 提交或推送；所有修改保留在 `codex/UI` 工作区，便于用户审查后按 Phase 分批提交。

## 14. 项目启动和演示步骤

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
# 如需演示 Provider，将 apps/api/.env 中 BRAND_FLOW_DEMO_MODE 改为 true
pnpm dev:deps
pnpm --filter @brand-flow/agent build
pnpm dev:code
```

生产或真实联调必须保持 `BRAND_FLOW_DEMO_MODE=false`，并配置有效模型、Pinecone 与图片 Provider 密钥。
