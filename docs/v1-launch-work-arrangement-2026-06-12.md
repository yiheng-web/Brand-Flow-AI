# Brand-Flow V1.0 第一版上线工作安排

> 文档日期：2026-06-12  
> 目标版本：V1.0 内测上线版  
> 依据：当前代码检查、`v1-development-weekly-plan.md`、`workflow-nodes-module.md`、`knowledge-base-module.md`、产品原型评审结论  
> 核心原则：第一版先把低门槛创作闭环跑通，再逐步展示节点流、知识库和企业管控能力。

---

## 1. 产品范围调整结论

### 1.1 首页保持低门槛

首页不做复杂表单，不把全部 B 端能力暴露给新用户。第一版首页只保留：

```text
一句自然语言输入
当前 Space 轻提示
可选知识库入口（折叠/轻量）
开始创作按钮
最近作品入口
```

用户首次进入时，应能不配置知识库、不理解节点流，也能直接完成一次创作。高级能力放到工作台节点详情和知识库页面中逐步展开。

### 1.2 个人 / 团队 / 企业知识库先做简化权限

第一版既面向 C 端个人，也面向 B 端团队/企业，但权限不要一次做成完整企业后台。

建议 V1.0 简化规则：

| Space      | 可用知识库                  | 可创建/上传                      | 作品归属 | 权限策略               |
| ---------- | --------------------------- | -------------------------------- | -------- | ---------------------- |
| personal   | 个人知识库                  | 当前用户                         | 我的作品 | 用户本人全权管理       |
| team       | 团队知识库 + 企业强制知识库 | 团队管理员、知识库管理员、创作者 | 团队作品 | 查看者不可上传/删除    |
| enterprise | 企业知识库                  | 企业管理员、品牌管理员           | 企业作品 | 普通成员只调用，不管理 |

上线前必须先解决当前代码中「个人空间没有 `entId` 就无法使用知识库/素材/作品」的问题。否则 C 端入口无法成立。

### 1.3 V1.0 必保链路

```text
注册 / 登录
↓
首页输入一句需求
↓
创建工作流
↓
7 节点工作台展示
↓
生成 4 张候选底图
↓
选择底图
↓
按 needsComposition 跳过或进入图文合成
↓
最终质检
↓
保存作品
↓
作品中心查看
↓
导出 PNG
```

---

## 2. 当前代码检查结论

### 2.1 构建与静态检查

本次检查命令：

```text
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd --filter @brand-flow/web build
pnpm.cmd --filter @brand-flow/api build
```

结果：

| 检查项                  | 结果 | 阻塞说明                                                                     |
| ----------------------- | ---- | ---------------------------------------------------------------------------- |
| 根构建 `pnpm.cmd build` | 失败 | `@brand-flow/agent` 找不到 `@langchain/pinecone`、`@langchain/textsplitters` |
| Web 构建                | 失败 | 知识库 API 封装与页面调用不一致，存在未使用变量和隐式 any                    |
| API 构建                | 失败 | Nest 构建提示 `@nestjs/swagger` plugin 未安装或配置不可用                    |
| Lint                    | 失败 | Agent/API 大量 Prettier 和 `any` 问题，已不是可上线状态                      |

### 2.2 主流程代码断点

| 模块                 | 当前问题                                                                                                      | 影响                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 首页                 | 视觉上已低门槛，但知识库选择没有真实接入；退出按钮无动作；仍显示无效导出入口                                  | 用户能输入，但上下文不完整         |
| 路由                 | 只有 `/home`、`/workspace`、`/brand`、`/profile`，缺 `/assets`、`/works`、作品详情正式路由                    | 保存作品后无法形成闭环             |
| 工作台前端           | 仍是 6 节点：intent、brand-kb、prompt、image-gen、compose、eval                                               | 与 V1.0 7 节点 PRD 不一致          |
| 工作台启动           | `workspace.tsx` 中重新启动时 `spaceId: 'personal'` 写死                                                       | 团队/企业空间上下文丢失            |
| Workflow 后端        | `WorkflowNodeType` 仍是 6 节点旧模型                                                                          | 无法保存创意方案节点和最终质检结构 |
| Workflow Processor   | `enterpriseId: workflow.spaceId` 错误；只传单个 `knowledgeId`；没有 `node_started` 持久化状态                 | Space/权限/SSE 联调会混乱          |
| Agent Graph          | 仍是 intent/knowledge/prompt/generate/evaluate/finish；没有 brief、creative direction、4 图评分、最终质检串联 | 主链路不是 V1.0 目标链路           |
| 生成服务             | `generateFourCandidates` 已有，但 Graph 未接入；普通生成仍可能只产 1 张                                       | 无法满足 4 候选图                  |
| 知识库/素材/作品后端 | 普遍要求 `enterpriseId`，个人空间会报「请先选择或切换到一家企业」                                             | C 端个人用户不可用                 |
| Works 前端           | 没有 `api/works.ts`，工作台保存只是浏览器本地下载                                                             | 作品中心与导出闭环断开             |
| Knowledge 前端       | 页面引用 `getKnowledgeItems/createKnowledgeItem/deleteKnowledgeItem` 等不存在导出                             | Web 构建直接失败                   |

---

## 3. 上线前 P0 闸门

以下问题不解决，不进入联调验收：

1. `pnpm.cmd build` 必须通过。
2. `pnpm.cmd --filter @brand-flow/web build` 必须通过。
3. `pnpm.cmd --filter @brand-flow/api build` 必须通过。
4. 根 `pnpm.cmd lint` 至少清零阻塞级 TypeScript/ESLint 错误。
5. 首页到工作台必须传递真实 `spaceId`、`spaceType`、`selectedKnowledgeBaseIds`。
6. Workflow、前端、Agent 必须统一到 7 节点命名和数据结构。
7. 个人空间必须可直接创作、保存作品、查看作品。
8. 工作台必须能拿到至少 1 张可预览图；V1.0 验收目标为 4 张候选图。
9. 质检必须评估最终结果，不只评估 Prompt。
10. 保存作品必须调用 `/works`，导出必须调用 `/works/:id/export`。

---

## 4. 人员任务安排

### 4.1 王一恒（产品负责人）

**P0：范围与决策**

| ID        | 任务                     | 验收标准                                                                                      | 截止 |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------- | ---- |
| WYH-P0-01 | 冻结首页低门槛方案       | 首页只保留一句话输入、Space 轻提示、知识库轻入口、开始创作                                    | 6.12 |
| WYH-P0-02 | 决定 V1.0 知识库简化权限 | personal/team/enterprise 权限表确认，不再临时变更                                             | 6.12 |
| WYH-P0-03 | 组织字段对齐会           | CreativeBrief、BrandConstraintPackage、PromptPlan、CandidateImage、FinalEvaluationResult 对齐 | 6.13 |
| WYH-P0-04 | 确认功能裁剪             | V1.0 不做复杂企业后台、复杂图层编辑、审批流、计费                                             | 6.13 |

**P1：验收与演示**

- 准备 10 条稳定演示 Prompt。
- 确认 6.21 主链路联调验收标准。
- 每天跟踪 P0 状态，P0 未清零不追加新需求。

---

### 4.2 贺峥嵘（产品 / 测试）

**P0：测试用例与状态清单**

| ID        | 任务                   | 验收标准                                                   | 依赖      |
| --------- | ---------------------- | ---------------------------------------------------------- | --------- |
| HZR-P0-01 | 更新 V1.0 主链路验收表 | 覆盖登录、首页创作、7 节点、4 图、质检、保存、导出         | WYH-P0-04 |
| HZR-P0-02 | 输出低门槛首页交互说明 | 明确知识库入口默认折叠；无知识库允许直接创作               | WYH-P0-01 |
| HZR-P0-03 | 输出错误/空状态用例    | 无知识库、生成失败、无 entId、无作品、导出失败都有预期文案 | 无        |
| HZR-P0-04 | 建立 Bug 表            | 每条 bug 包含复现步骤、负责人、优先级、期望结果            | 无        |

**P1：联调支持**

- 6.15 起每日执行主链路冒烟。
- 记录每轮回归是否能从首页走到导出。

---

### 4.3 练洋洋（UI）

**P0：减少首页复杂度，补齐关键状态**

| ID        | 任务                    | 验收标准                                                      | 依赖         |
| --------- | ----------------------- | ------------------------------------------------------------- | ------------ |
| LYY-P0-01 | 首页轻量版 UI 标注      | 首页不出现复杂参数表；高级知识库配置折叠                      | WYH-P0-01    |
| LYY-P0-02 | 7 节点状态标注          | pending/running/completed/failed/stale/skipped 全部有视觉状态 | 无           |
| LYY-P0-03 | 4 候选图与评分卡片      | 候选图、推荐态、低分风险可区分                                | YCY 输出字段 |
| LYY-P0-04 | 最终质检报告标注        | 分项分、扣分项、回溯建议、可导出状态清晰                      | YCY 输出字段 |
| LYY-P0-05 | 作品中心/作品详情高保真 | 能支撑前端实现保存后查看与导出                                | QSS          |

---

### 4.4 邱珊珊（前端：首页 / 知识库 / 素材 / 作品）

**P0：让入口和作品闭环可用**

| ID        | 任务                       | 当前 bug / 缺口                                  | 验收标准                                                        | 依赖       |
| --------- | -------------------------- | ------------------------------------------------ | --------------------------------------------------------------- | ---------- |
| QSS-P0-01 | 修复 Web 构建错误          | `knowledge.ts` 导出与页面引用不一致              | `pnpm.cmd --filter @brand-flow/web build` 不再因知识库页面失败  | 无         |
| QSS-P0-02 | 首页保持低门槛并接真实参数 | 当前只传 `prompt/spaceId/spaceType`，无知识库 ID | 创建 workflow 时传 `selectedKnowledgeBaseIds`，无知识库传空数组 | LH/CHY DTO |
| QSS-P0-03 | 修复首页退出按钮           | 顶部「退出」无 onClick                           | 点击退出清 token 并跳转 `/login`                                | 无         |
| QSS-P0-04 | 主导航和路由补齐           | 缺 `/assets`、`/works`、作品详情                 | 首页、工作台、知识库、素材、作品、个人中心均可访问              | 无         |
| QSS-P0-05 | 新增 `api/works.ts`        | 前端没有作品 API                                 | 封装 create/list/detail/export/delete                           | LH         |
| QSS-P0-06 | 作品中心页                 | 当前无正式页面                                   | 展示当前 Space 下作品列表，可查看详情/导出                      | LH         |
| QSS-P0-07 | 作品详情页                 | 当前无正式页面                                   | 展示最终图、节点快照、质检报告、导出按钮                        | LH/LYH     |
| QSS-P0-08 | 素材页替换 `/brand` 占位   | 当前 `brand` 概念与素材资产混用                  | 正式路由 `/assets`，上传/列表/删除最小可用                      | LH         |

**P1：体验优化**

- KnowledgeSelector 做成轻量组件：默认只展示已选摘要，点击后展开。
- 无知识库时显示「可直接创作，也可稍后创建知识库」。
- 统一 `id/_id` 字段适配，不在页面层散落临时判断。

---

### 4.5 李雨寒（前端：工作台 / 节点流）

**P0：工作台对齐 V1.0 主链路**

| ID        | 任务                              | 当前 bug / 缺口                             | 验收标准                                                            | 依赖        |
| --------- | --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- | ----------- |
| LYH-P0-01 | 6 节点改 7 节点                   | `workspace.const.ts` 缺创意方案             | 展示需求翻译、品牌约束、创意方案、Prompt、底图、图文合成、品牌质检  | CHY/YXY/YCY |
| LYH-P0-02 | 移除 `spaceId: 'personal'` 硬编码 | 工作台直接启动会丢 Space                    | 使用 store/navState 中真实 Space                                    | QSS         |
| LYH-P0-03 | 对接新节点状态                    | 当前只有 done/running/pending/failed        | 支持 skipped/stale，并正确展示跳过原因                              | CHY         |
| LYH-P0-04 | 4 候选图 UI                       | 当前只展示单张 `baseImageUrl`               | 4 图网格、评分、推荐、手动选择                                      | YCY         |
| LYH-P0-05 | 图文合成分支                      | compose 现在近似占位，完成时强制 done       | `needsComposition=false` 显示 skipped，true 时进入基础合成          | YXY/CHY     |
| LYH-P0-06 | 最终质检 UI                       | 当前 EvalPanel 是旧 Prompt 评分             | 展示最终图分项分、扣分项、回溯建议、是否允许导出                    | YCY         |
| LYH-P0-07 | 保存作品                          | 当前只是浏览器下载                          | 调用 `POST /works` 保存 finalImageUrl、nodesSnapshot、qualityReport | LH/QSS      |
| LYH-P0-08 | SSE 事件对齐                      | 前端监听 `node_started`，后端进度事件不完整 | running/completed/skipped/failed 不会卡死                           | CHY         |

**P1：工作台可用性**

- 节点失败时展示失败原因和重试按钮。
- 修改节点后，下游 stale 视觉提示明确。
- 画板先做基础图层，不做复杂 PS 级能力。

---

### 4.6 陈弘毅（后端：Auth / Space / Workflow / SSE）

**P0：统一 Workflow 主链路**

| ID        | 任务                                  | 当前 bug / 缺口                                    | 验收标准                                                                     | 依赖         |
| --------- | ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------ |
| CHY-P0-01 | Workflow Schema 升级 7 节点           | `WorkflowNodeType` 仍是 6 节点                     | DB 初始化 7 节点，类型与 PRD 一致                                            | WYH 字段冻结 |
| CHY-P0-02 | CreateWorkflowDto 升级                | 只支持单 `knowledgeId`                             | 支持 `spaceType`、`selectedKnowledgeBaseIds: string[]`                       | LH/QSS       |
| CHY-P0-03 | 修复 `enterpriseId: workflow.spaceId` | Processor 把 spaceId 当 enterpriseId               | Agent context 中 `spaceId`、`spaceType`、`enterpriseId` 分离                 | 无           |
| CHY-P0-04 | Processor 串联 V1 主链路              | 当前只跑旧 Graph                                   | 支持 7 节点结果入库；过渡期可展示 7 节点、执行层合并                         | YXY/YCY      |
| CHY-P0-05 | SSE 事件补齐                          | 当前主要靠 `node_completed`，`node_started` 不完整 | 推送 node_started/node_completed/node_skipped/node_failed/workflow_completed | 无           |
| CHY-P0-06 | 节点 skipped/stale 持久化             | 条件节点状态不完整                                 | 品牌约束、图文合成可准确 skipped；修改前置节点后下游 stale                   | YXY          |
| CHY-P0-07 | 修复 API 构建                         | `@nestjs/swagger` plugin 报错                      | `pnpm.cmd --filter @brand-flow/api build` 通过                               | 无           |

**P1：联调稳定性**

- 节点重跑从指定节点继续执行。
- 长任务 SSE 断连后可恢复。
- 权限拒绝返回清晰业务错误。

---

### 4.7 李轰（后端：Knowledge / Assets / Works / Export）

**P0：让 C 端个人和 B 端空间都能闭环**

| ID       | 任务                      | 当前 bug / 缺口                         | 验收标准                                                                        | 依赖         |
| -------- | ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- | ------------ |
| LH-P0-01 | 个人空间解除 `entId` 阻塞 | Knowledge/Assets/Works 都要求企业       | personal 可创建个人知识库、上传个人素材、保存个人作品                           | WYH 权限决策 |
| LH-P0-02 | 三层知识库最小权限落地    | 代码主要按 enterpriseId 过滤            | personal/team/enterprise 按 §1.2 规则隔离                                       | CHY Space    |
| LH-P0-03 | 多知识库查询支持          | 当前接口和 Agent 多数只接单 knowledgeId | 支持 selectedKnowledgeBaseIds[]，只检索 active 项                               | CHY/YCY      |
| LH-P0-04 | Works 保存字段确认        | 前端未对接，字段结构不稳定              | CreateWorkDto 示例明确：finalImageUrl、workflowId、nodesSnapshot、qualityReport | LYH/QSS      |
| LH-P0-05 | 导出 PNG 联调             | 后端有 `/works/:id/export`，前端未用    | 返回 downloadUrl，个人作品也可导出                                              | QSS          |
| LH-P0-06 | 素材上传个人空间可用      | 当前上传要求 enterpriseId               | personal 上传图片后可列表展示，可选加入个人知识库                               | QSS          |

**P1：资产沉淀**

- 生成结果保存到素材库。
- 素材转知识项接口与前端打通。
- 测试数据清理脚本或操作说明。

---

### 4.8 严喜盈（Agent：需求翻译 / 创意方案 / Prompt）

**P0：前 3 个 AI 节点结构化**

| ID        | 任务                        | 当前 bug / 缺口                             | 验收标准                                                        | 依赖         |
| --------- | --------------------------- | ------------------------------------------- | --------------------------------------------------------------- | ------------ |
| YXY-P0-01 | `intent-chain` 升级为 Brief | 当前输出旧 `IntentOutput`                   | 输出 CreativeBrief，含 outputMode、needsComposition、textIntent | WYH 字段冻结 |
| YXY-P0-02 | 新增创意方案链              | 当前 Agent Graph 无该节点                   | 一次输出 3 个 CreativeDirection，差异明确                       | YXY-P0-01    |
| YXY-P0-03 | PromptPlan 升级             | 当前 Prompt 只有 finalPrompt/negativePrompt | 输出 imagePrompt、negativePrompt、layoutPlan、modelParams       | YXY-P0-01    |
| YXY-P0-04 | 图文分支规则                | 当前不能稳定判断 compose 是否跳过           | pure_image => needsComposition=false；海报/标题/Logo => true    | 无           |
| YXY-P0-05 | Agent 构建修复协作          | 当前 Agent build 缺依赖或安装状态异常       | 配合修复后 `@brand-flow/agent` build 通过                       | 严承羽       |

**P1：稳定性**

- 提供 10 条 mock 样例，覆盖纯图片、图文成片、场景文字、叠加文字。
- JSON 解析失败时返回默认结构，不能让主流程崩。

---

### 4.9 严承羽（Agent：品牌约束 / 生成 / 评分 / 质检）

**P0：后 4 个 AI 节点能跑通**

| ID        | 任务                       | 当前 bug / 缺口                                          | 验收标准                                         | 依赖           |
| --------- | -------------------------- | -------------------------------------------------------- | ------------------------------------------------ | -------------- |
| YCY-P0-01 | 品牌约束包接入 Graph       | `buildConstraintPackage` 存在但未接入                    | 输出 required/recommended/optional，并能 skipped | LH/CHY         |
| YCY-P0-02 | 4 候选图接入 Graph         | `generateFourCandidates` 存在但未使用                    | image_generation 节点固定返回 4 张候选图         | YXY PromptPlan |
| YCY-P0-03 | 候选图评分接入             | `candidate-evaluate` 代码存在但未串联                    | 每张图有总分、分项、推荐态                       | YCY-P0-02      |
| YCY-P0-04 | 最终质检替换旧 Prompt 评估 | 当前 `evaluateNode` 评 Prompt，不评最终图                | 输出 FinalEvaluationResult、扣分项、回溯建议     | LYH 合成       |
| YCY-P0-05 | 生成失败降级               | 模型失败会影响整条链                                     | 返回可展示错误；演示可用 fallback 图             | 无             |
| YCY-P0-06 | 修复 Agent 构建依赖        | 本地缺 `@langchain/pinecone`、`@langchain/textsplitters` | `pnpm.cmd --filter @brand-flow/agent build` 通过 | 无             |

**P1：质检可信度**

- 分数与视觉结果基本一致。
- 回溯建议能指向具体节点。
- 企业规则冲突要给明确原因。

---

## 5. 推荐执行顺序

### 6.12 - 6.13：先清工程闸门和字段

1. 王一恒冻结首页简化方案、知识库简化权限、字段结构。
2. 陈弘毅、李轰确定 Space / entId / ownerType / visibility 的后端策略。
3. 严喜盈、严承羽确定 Agent 7 节点输出 Schema。
4. 邱珊珊先修 Web 构建中知识库 API 不一致问题。
5. 严承羽先修 Agent 依赖/构建问题。
6. 陈弘毅修 API 构建 Swagger 插件问题。

### 6.14 - 6.16：主链路最小跑通

1. 首页创建 workflow：传 prompt、spaceId、spaceType、selectedKnowledgeBaseIds。
2. 后端初始化 7 节点，SSE 推送状态。
3. Agent 可先用过渡方案：展示层 7 节点，执行层先合并部分节点，但输出结构按 7 节点包装。
4. 工作台展示 7 节点和至少 1 张图，目标 4 张候选图。
5. 个人空间保存作品可用。

### 6.17 - 6.21：联调闭环

1. 4 候选图 + 候选评分接入。
2. needsComposition 分支接入。
3. 最终质检接入。
4. 保存作品到作品中心。
5. 作品详情和导出 PNG。
6. 贺峥嵘执行第一轮完整验收。

### 6.22 - 6.28：修 bug 和体验打磨

1. P0 bug 清零。
2. 错误状态、空状态补齐。
3. 演示 Prompt 和 fallback 数据准备。
4. UI 统一和响应式修复。
5. 6.28 功能冻结。

---

## 6. 每日站会检查模板

```text
负责人：
昨日完成：
今日目标：
当前阻塞：
是否影响主链路：首页 -> 工作台 -> 生成 -> 质检 -> 保存 -> 作品中心 -> 导出：
需要谁配合：
风险等级：低 / 中 / 高
```

---

## 7. 第一版验收清单

| 验收项                       | 是否必须 | 负责人                 |
| ---------------------------- | -------- | ---------------------- |
| 用户可注册 / 登录 / 退出     | 必须     | 陈弘毅、邱珊珊         |
| 首页一句话输入可直接开始创作 | 必须     | 邱珊珊                 |
| 无知识库也能创作             | 必须     | 李轰、陈弘毅           |
| 选择 Space 后创作上下文不丢  | 必须     | 邱珊珊、陈弘毅、李雨寒 |
| 工作台展示 7 节点            | 必须     | 李雨寒、陈弘毅         |
| 生成 4 张候选图              | 必须     | 严承羽、李雨寒         |
| 候选图有评分和推荐           | 必须     | 严承羽、李雨寒         |
| 图文合成可跳过               | 必须     | 严喜盈、陈弘毅、李雨寒 |
| 最终质检报告可读             | 必须     | 严承羽、李雨寒         |
| 保存作品调用后端             | 必须     | 李雨寒、李轰           |
| 作品中心展示保存结果         | 必须     | 邱珊珊、李轰           |
| 作品详情可查看节点记录       | 必须     | 邱珊珊、李轰           |
| 导出 PNG 可用                | 必须     | 邱珊珊、李轰           |
| 根 build 通过                | 必须     | 全体研发               |
| 根 lint 阻塞错误清零         | 必须     | 全体研发               |

---

## 8. 当前最优先修复清单

1. 修复 Agent 构建依赖缺失：`@langchain/pinecone`、`@langchain/textsplitters` 当前本地不可解析。
2. 修复 API 构建：`@nestjs/swagger` plugin 配置导致 `nest build` 失败。
3. 修复 Web 构建：知识库页面引用不存在 API 导出。
4. 把 Workflow 从 6 节点统一到 7 节点。
5. 移除 `workspace.tsx` 中 `spaceId: 'personal'` 硬编码。
6. 个人空间解除 `entId` 阻塞。
7. 首页增加轻量 KnowledgeSelector，但默认不增加用户负担。
8. 接入 `api/works.ts`、作品中心、作品详情、导出。
9. Agent Graph 接入 4 候选图和最终质检。
10. 清理 `any` 和 Prettier，恢复 lint 作为上线闸门。

---

## 9. 产品提醒

第一版不要证明我们“所有功能都强”，而要证明：

```text
普通用户不用学习就能生成一张可用图；
进阶用户能看到 AI 为什么这么做；
团队/企业用户能看到知识库和品牌约束的价值；
最终作品能保存、找回、导出。
```

因此首页越轻越好，工作台越可解释越好，知识库权限第一版越稳越好。
