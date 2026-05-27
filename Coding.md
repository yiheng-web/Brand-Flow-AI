# Brand-Flow AI 代码规范（全仓）

本规范适用于 **Brand-Flow AI** 智能图文创作平台的 Monorepo 仓库，覆盖 **`apps/web`**（前端）、**`apps/api`**（NestJS 后端）与 **`packages/agent`**（AI 逻辑库）。目标是：**类型安全、边界清晰、风格一致、便于多人并行开发**。

- **包管理**：pnpm workspaces（根目录统一 `pnpm install`）。  
- **任务编排**：Turborepo（`pnpm dev` / `pnpm build` / `pnpm lint`）；根目录 `pnpm dev` 会先构建 `@brand-flow/agent`，避免 API 读取不到 dist 产物。  
- **静态检查与格式**：根目录 [eslint.config.js](eslint.config.js)（按目录分区）+ [.prettierrc.json](.prettierrc.json)；提交前请在仓库根执行 **`pnpm lint`**。

---

## 1. 全仓通用约定

### 1.1 命名

| 类型 | 风格 | 示例 |
|------|------|------|
| 变量、函数、方法 | `camelCase` | `activeNodeId`、`fetchWorkflowData` |
| 类、接口、类型、组件、枚举名 | `PascalCase` | `UserService`、`WorkspaceProps`、`NodeStatus` |
| 常量（配置、魔法数字、环境键名） | `UPPER_SNAKE_CASE` | `DEFAULT_CANVAS_ZOOM`、`MAX_RETRY` |

- 事件处理函数建议使用 **`handle` 前缀**：`handleNodeDragStart`。  
- 封装 HTTP 或仓库访问的函数建议使用 **动词前缀**：`get` / `fetch` / `query` / `update` / `delete`。

### 1.2 TypeScript

- **禁止滥用 `any`**。未知错误使用 `unknown`，在分支内收窄类型后再使用。  
- 对外边界（组件 Props、API 入参/出参、Agent 导出函数）必须有 **显式类型**（`interface` / `type`）。  
- 跨包契约（Web 调用的 DTO、API 暴露给前端的类型、Agent 导出给 API 的类型）优先 **单独类型文件或 DTO 类**，避免隐式结构。

### 1.3 导入顺序（推荐）

块与块之间空一行，顺序如下：

1.  side-effect 导入（若有，如 `reflect-metadata` 仅出现在 API 入口）。  
2.  外部依赖（`react`、`@nestjs/common`、`zustand` 等）。  
3.  内部别名路径（Web：`@/…`）。  
4.  相对路径（同目录组件、样式、本地工具）。

```typescript
import { useCallback, useState } from 'react'
import { Button, message } from 'antd'

import { useFlowStore } from '@/store/useFlowStore'
import { runTask } from '@/api/workflow'

import { Toolbar } from './Toolbar'
import styles from './workspace.module.css'
```

### 1.4 Git 与提交习惯

- 单次提交聚焦单一主题，便于 Code Review。  
- 不提交 **密钥、Token、本机路径**；敏感配置走环境变量（由后端或部署平台注入）。  
- 合并前自检：**`pnpm lint`**；涉及类型或构建链路的改动建议本地 **`pnpm build`**。

---

## 2. 前端（`apps/web`）

技术栈：**Vite + React 19 + TypeScript + React Router + Zustand + Ant Design + React Flow + Fabric.js + Axios**（及项目已引入的其余依赖）。

### 2.1 目录职责

| 路径 | 用途 |
|------|------|
| `src/pages/` | 页面级视图与业务组合 |
| `src/layouts/` | 布局壳层 |
| `src/router/` | 路由表与懒加载配置 |
| `src/store/` | Zustand 全局状态 |
| `src/api/` | 对后端 HTTP 的封装（统一入口，避免在组件内散落裸 `axios`） |
| `src/assets/` | 静态资源 |

路径别名 **`@/*` → `src/*`**（见 `vite.config.ts` / `tsconfig.app.json`）。

### 2.2 组件与类型

推荐使用 **`React.FC<Props>`** 或显式标注返回类型，Props 使用 `interface` 或 `type` 声明。

```typescript
import type { FC, ReactNode } from 'react'

interface WorkspaceProps {
  taskId: string
  children?: ReactNode
}

export const Workspace: FC<WorkspaceProps> = ({ taskId, children }) => {
  // ...
}
```

### 2.3 枚举

对有限状态集（如节点运行状态）可使用 `enum` 或 `as const` 对象，团队内需统一一种风格；若使用 `enum`，建议字符串枚举便于序列化。

```typescript
export enum NodeStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}
```

### 2.4 状态管理（Zustand）

- **禁止**引入 Redux/Dva 等传统模式；全局状态放在 **`src/store/`**。  
- Store 内可写异步逻辑，使用 **`async/await`**；错误需处理，避免吞异常。  
- 从 Store 取状态时尽量 **按字段 selector** 订阅，减少无关重渲染。

### 2.5 API 与异步

- 使用 **`async/await`**，配合 `try / catch / finally`；`catch` 中参数类型为 **`unknown`**，再判断 `instanceof Error` 或业务错误结构。  
- 用户可见反馈使用 Ant Design `message` / `Modal` 等，与业务错误码约定一致。  
- Vite 环境变量使用 **`import.meta.env.VITE_*`**，并在类型侧做窄化（如 `as string` 或 zod 校验）。

### 2.6 React Flow 与 Fabric.js

- **高频画布事件**（拖拽、指针移动）不要直接驱动大范围 React `useState` 或整块 Zustand 更新，避免卡顿。  
  - React Flow：节点/边数据可进 Zustand，但更新频率高的场景配合 **防抖/节流** 或局部 `useRef`。  
  - Fabric：**实例挂在 `useRef`**，与 React 树生命周期对齐（卸载时 `dispose`）。  
- 右侧配置面板等使用 Ant Design **`Form`**，在选中节点变化时 **`setFieldsValue`** / `resetFields`，并配置 `rules` 做校验。

### 2.7 样式

- 优先 **CSS Modules**（`*.module.css` / `*.module.less`），避免全局污染。  
- 禁止为裸标签写全局样式覆盖 Ant Design/React Flow 内部结构（除非经评审的极少数场景）。

### 2.8 权限与路由

- 声明式鉴权组件（示例）：根据 `useUserStore` 中的角色渲染子节点或 `null`。  
- 路由级守卫与登录重定向逻辑集中在 **`router/`** 或与布局组合，避免在深层页面重复判断。

---

## 3. 后端（`apps/api`）

技术栈：**NestJS 11 + TypeScript**；数据与队列侧已规划 **MongoDB（Mongoose）、Redis、BullMQ**；向量检索 **Pinecone** 等由配置注入，不在代码库写死密钥。

### 3.1 分层与职责

| 层次 | 职责 |
|------|------|
| `*.controller.ts` | HTTP 路由、状态码、DTO 绑定；**保持薄**，不写复杂 Prompt 或长链路 LLM 逻辑。 |
| `*.service.ts` | 业务编排、调用 Repository、队列、外部服务；**可** `import` **`@brand-flow/agent`** 并调用其导出函数。 |
| `*.module.ts` | 依赖装配与模块边界。 |

### 3.2 引入 `@brand-flow/agent`

依赖在 `package.json` 中声明为 **`workspace:*`**。在 Service 中：

```typescript
import { AGENT_VERSION } from '@brand-flow/agent'
```

- **禁止**在 Controller 内堆叠大段 Prompt 字符串；与模型相关的文本与链式逻辑放在 **`packages/agent`**。  
- 运行时代码加载的是 Agent 的 **`main`（编译产物 `dist`）**；本地联调优先从根目录执行 **`pnpm dev`**，会先构建 Agent 再启动 API。若单独启动 API，请先执行 **`pnpm --filter @brand-flow/agent build`** 或根目录 **`pnpm build`**。

### 3.3 Nest 编码习惯

- 使用 **依赖注入**，避免在 Service 内 `new` 可注入的依赖。  
- 异步方法返回 **`Promise<T>`** 类型明确化；错误使用 Nest 内置 **`HttpException`** 子类或统一异常过滤器（若后续引入）。  
- 配置项（数据库 URI、Redis、API Key）从 **`process.env`** 或 `ConfigModule` 读取，**禁止**将生产密钥提交到 Git。

### 3.4 与前端协作

- DTO 与响应结构尽量 **稳定、可版本化**；破坏性变更需同步前端 `src/api` 与类型定义。  
- CORS、Cookie、鉴权头与 README 中约定保持一致。

---

## 4. AI 逻辑库（`packages/agent`）

技术栈以 **LangChain.js 生态**为主（具体依赖见 `packages/agent/package.json`）；**不包含** Nest / Express / React。

### 4.1 边界

- **只做库**：导出函数、Chain 工厂、Prompt 常量、类型等；**不**在此创建 HTTP 服务器。  
- **不**在此写与 MongoDB/Redis 强耦合的基础设施代码（由 API 注入客户端或配置后传入纯函数参数更佳）。

### 4.2 目录约定

| 路径 | 用途 |
|------|------|
| `src/ai-logic/prompts/` | Prompt 模板与系统提示文本 |
| `src/ai-logic/chains/` | LangChain 链组装、工作流编排入口 |
| `src/ai-logic/evaluate/`、`src/ai-logic/memory/` | 评估与记忆扩展 |
| `src/brand/`、`src/generate/` | 品牌域、生成域业务分包 |
| `src/common/` | 跨模块常量与工具 |
| `src/index.ts` | **对外稳定导出**；新增导出需考虑 API 兼容性 |

### 4.3 代码风格

- 优先 **纯函数** 与 **小模块**，便于单测。  
- 与模型、向量库交互的 **密钥与 endpoint** 由调用方（API）注入，Agent 内不写死生产环境配置。  
- 对外导出命名清晰，避免从 `index.ts` 导出过多同名符号导致冲突。

---

## 5. ESLint 与 Prettier（根目录）

- **`apps/web/**/*.{ts,tsx}`**：浏览器全局 + React Hooks + React Refresh。  
- **`apps/api/**/*.ts`**、**`packages/agent/**/*.ts`**：Node 全局，无 React Refresh。  
- 全仓启用 **Prettier 推荐集成**；与 ESLint 冲突规则由 `eslint-config-prettier` 处理。

若某条规则在特殊场景下必须关闭，须在 PR 中说明理由，并尽量 **局部 disable**，禁止无注释大面积关闭。

---

## 6. 文档与演进

- 仓库入口说明见 [README.md](README.md)。  
- 本文件随架构与栈迭代 **持续更新**；新增全仓级约定时，请同步修改本节或对应章节并知会全员。

---

**一致的风格是团队速度的放大器。请从下一个 PR 开始，把本规范当作默认肌肉记忆。** ✨
