# 🚀 Brand-Flow AI

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-000000?logo=turborepo&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)

## 1. 顶部标题与简介

**Brand-Flow AI 智能图文创作平台** —— 我们要做的，不是又一个「一键出图」的黑盒玩具，而是一座 **AI 时代的透明加工厂**：从意图解析、知识匹配到排版生成，全程 **可视化、可干预、可品牌化**，让用户真正参与工作流的每一步。

传统生图产品往往把用户挡在结果之外：prompt 不透明、过程不可改、品牌调性靠运气。我们反其道而行之 —— 用 **节点流（React Flow）** 把链路摊开，用 **强类型与模块化 Monorepo** 把工程边界划清，让前端、后端与 AI 逻辑工程师 **各守其位、又紧密咬合**，一起把「可控的智能创作」做成默认体验。

---

## 2. 📦 Monorepo 目录架构导读

我们用 **pnpm workspaces + Turborepo** 管理整个仓库：依赖安装一次在根目录完成，构建与开发任务由 Turbo 编排，**谁改哪块代码，一眼就能找到家**。

```text
Brand-Flow-AI/
├── apps/
│   ├── web/                    # @brand-flow/web —— 前端同学的主战场
│   │   ├── src/
│   │   │   ├── pages/          # 页面与业务视图
│   │   │   ├── layouts/        # 布局壳层
│   │   │   ├── router/         # 路由配置
│   │   │   ├── store/          # Zustand 全局状态
│   │   │   └── api/            # 对后端 HTTP 的封装
│   │   ├── public/
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── api/                    # @brand-flow/api —— 后端同学的主战场
│       └── src/                # NestJS：Module / Controller / Service
├── packages/
│   └── agent/                  # @brand-flow/agent —— AI 与 Prompt 工程师的魔法工坊
│       └── src/
│           ├── ai-logic/       # Prompts、Chains、Evaluate、Memory
│           ├── brand/          # 品牌域逻辑扩展
│           ├── generate/       # 生成域逻辑扩展
│           └── common/         # 公共导出与常量
├── package.json                # 根脚本：dev / build / lint（走 Turbo）
├── pnpm-workspace.yaml
├── turbo.json
├── eslint.config.js            # 全仓 ESLint（按 apps/web 与 api+agent 分区）
├── .prettierrc.json
└── Coding.md                   # 更细的编码约定（必读）
```

| 目录                 | 谁该关心         | 一句话                                                                                                                                                                              |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apps/web`**       | 前端             | 用户看得见的一切：工作流画布、精修区、Ant Design 界面、与 API 的对话。                                                                                                              |
| **`apps/api`**       | 后端             | HTTP、鉴权、MongoDB、Redis、BullMQ 队列、对接 Pinecone；**通过依赖引用** Agent 包，不在此写 Prompt 细节。                                                                           |
| **`packages/agent`** | AI 逻辑 / Prompt | **LangChain.js** 编排、（演进中的 **LangGraph.js** 多步状态机）、对接 GPT-4o 做解析与评估、生图模型侧（如 SDXL / Flux）的调用封装；**此包被 `apps/api` 引用，不单独起 HTTP 服务。** |

> 💡 **协作心法**：数据进出的「门」在 **API**；「脑子」里怎么推理、怎么拼 Chain，在 **Agent**。前端只信 **REST/约定好的接口**，不要直接 import `@brand-flow/agent`。

---

## 3. 🛠️ 快速启动 (Quick Start)

### 环境要求

| 工具        | 版本                                                                |
| ----------- | ------------------------------------------------------------------- |
| **Node.js** | `>= 20`（建议使用 LTS）                                             |
| **pnpm**    | `>= 9`（仓库根 `packageManager` 已锁定推荐版本，建议开启 Corepack） |

### 安装依赖

**只需在仓库根目录执行一次：**

```bash
pnpm install
```

> 若出现 **Ignored build scripts** 类提示（如原生依赖），可在根目录按需执行 `pnpm approve-builds`，按团队安全策略勾选。

### 启动全局开发环境（Turbo）

API 依赖本地 MongoDB 与 Redis。仓库已提供 `apps/api/docker-compose.yml`，因此需要先确保 Docker Desktop 正在运行。

在根目录一键拉起本地依赖与各包已声明的 `dev` 任务（例如 Web 的 Vite + API 的 Nest watch）：

```bash
pnpm dev
```

**推荐：完整一键启动**（Docker → 检查 `.env` → 构建 Agent → Web + API + Agent）：

```bash
pnpm dev:all
# 或
pnpm start
```

首次运行前请在 `apps/api/.env` 中填写有效的 `SILICONFLOW_API_KEY`（若不存在会从 `.env.example` 自动复制）。文本与图片理解通过 Chat Completions 调用 `Pro/moonshotai/Kimi-K2.6`，四候选底图通过 Images API 调用 `Kwai-Kolors/Kolors`，两类模型统一使用 SiliconFlow。若密钥仍是占位符 `sk-xxxxxxx`，启动会中止；仅调试 UI 时可执行 `pnpm dev:all -- --skip-key-check`。

SiliconFlow 配置示例：`SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1`、`SILICONFLOW_CHAT_MODEL=Pro/moonshotai/Kimi-K2.6`、`IMAGE_MODEL=Kwai-Kolors/Kolors`。API Key 只保存在本地 `apps/api/.env`，不要提交到 Git。V1 默认设置 `KNOWLEDGE_VECTOR_MODE=disabled`，直接读取 MongoDB 品牌约束；语义检索与向量诊断不可用。

文本与视觉请求遵循 [SiliconFlow Chat Completions 官方契约](https://api-docs.siliconflow.cn/docs/api/chat-completions-post)，图片内容使用 `image_url` 消息块。

可在启动服务前分别执行以下 SiliconFlow 脱敏冒烟检查；脚本只输出状态、请求 ID 和简短文本，不输出 Key 或完整响应。

```bash
node scripts/smoke-siliconflow-chat.mjs text
node scripts/smoke-siliconflow-chat.mjs vision
```

配置 SiliconFlow Key 后，可以执行一次会产生真实生图费用的脱敏检查：

```bash
node scripts/smoke-siliconflow-image.mjs
```

等价于分步执行：

```bash
pnpm dev:deps
pnpm dev:code
```

如果只想启动或停止基础设施：

```bash
pnpm dev:deps
pnpm dev:deps:down
```

### V1 演示模式

默认逻辑调用真实模型与图片 Provider。仅在本地演示且缺少模型凭据时，可显式设置：

```text
apps/api/.env: BRAND_FLOW_DEMO_MODE=true
apps/web/.env: VITE_BRAND_FLOW_DEMO_MODE=true
```

演示模式返回与真实接口一致的七节点、四候选图和质检类型，页面会明确显示“演示模式”。环境变量清单见各应用的 `.env.example`。

**只想跑某一个包？** 用 filter，互不打扰：

```bash
pnpm --filter @brand-flow/web dev
pnpm --filter @brand-flow/api dev
pnpm --filter @brand-flow/agent dev
```

### 常用根命令速查

```bash
pnpm install    # 安装依赖
pnpm dev        # 并行开发（Turbo）
pnpm build      # 全量构建（依赖包会先 ^build，例如 Agent 先于 API）
pnpm lint       # 全仓 ESLint
```

---

## 4. 🧑‍💻 各模块开发指南 (Developer Guide)

### 🎨 前端组（`apps/web`）

- **主修改区**：`apps/web/src`。新页面进 `pages/`，路由在 `router/`，布局在 `layouts/`。
- **全局状态**：认准 `store/`（Zustand），避免在深层组件里散落「隐式全局」。
- **工作流画布**：与 **React Flow** 相关的节点、边、画布交互，优先在 workspace 相关页面与可复用组件中组织，保持「画布逻辑」与「纯展示 UI」分层。
- **局部精修**：**Fabric.js** 相关能力按功能域拆组件，避免与 Flow 状态强耦合。
- **请求后端**：统一走 `src/api/` 下的封装，便于对 Base URL、错误码与类型做集中治理。

你的使命：把产品愿景翻译成 **流畅、可访问、可调试** 的界面 —— 让用户感到「我在驾驶这台机器」，而不是被机器推着走。

---

### ⚙️ 后端组（`apps/api`）

- **主战场**：`apps/api/src`。按 Nest 惯例扩展 `*.module.ts`、`*.controller.ts`、`*.service.ts`。
- **职责边界**：HTTP、DTO、鉴权、MongoDB（Mongoose）、Redis、**BullMQ 异步生图队列**、Pinecone 向量检索的编排与密钥管理 —— 都在这里收口。
- **如何引入本地 Agent 包**：依赖已在 `package.json` 中声明为 workspace 协议：

```json
"@brand-flow/agent": "workspace:*"
```

在 Service 中直接：

```typescript
import { AGENT_VERSION } from '@brand-flow/agent'
```

> ⚠️ **运行时**：Node 加载的是 Agent 编译产物（`main` → `dist`）。若单独调试 API 且报错缺包，先在根目录执行 `pnpm --filter @brand-flow/agent build` 或全量 `pnpm build`。

你的使命：做 **可靠、可观测、可扩展** 的平台层 —— 让 AI 组专注「聪明」，你负责「稳」。

---

### 🧠 AI 逻辑组（`packages/agent`）

- **主战场**：`packages/agent/src`。所有 **Prompt 模板**、**LangChain Chain 组装**、（演进中的 **LangGraph.js** 多步状态图）、对 GPT-4o / 生图模型的调用封装，都应在此沉淀为 **可测试、可版本化** 的模块。
- **目录约定**：`ai-logic/prompts`、`ai-logic/chains`、`evaluate`、`memory` 为当前骨架；`brand/`、`generate/` 承载领域扩展；从 `src/index.ts` **稳定导出** API 需要的公共接口。
- **不要去改** `apps/api` 里的 Controller 来「临时拼一段 prompt」—— 那是技术债的温床。正确姿势：在 Agent 内实现函数或 Chain，由 Service **一行 import** 接入。

你的使命：把「模型能力」变成 **可组合、可评估、可迭代** 的产品语言 —— 我们卖的是 **透明工作流**，不是一次性的魔法输出。

---

## 5. 📖 编码规范与注意事项

1. **详细规范**：根目录 **[`Coding.md`](Coding.md)** 包含命名、TypeScript、导入顺序、组件结构等约定 —— **提交代码前请务必浏览**，尤其是前端与共享类型相关改动。
2. **TypeScript 强类型**：优先用显式 `interface` / `type` 描述对外契约；避免滥用 `any`，让 Monorepo 的跨包引用（Web ↔ API DTO、API ↔ Agent）成为 **自文档化** 的安全网。
3. **提交前自检**：在仓库根目录执行 **`pnpm lint`**，确保通过 ESLint 检查后再发起合并请求；编辑器建议开启 Prettier 与 ESLint 保存时联动（与团队统一即可）。

---

**欢迎每一位组员在这里留下你的 commit —— 我们一起把 Brand-Flow AI 做成团队愿意安利、用户愿意买单的产品。** ✨
