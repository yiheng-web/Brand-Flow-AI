# Brand-Flow AI Agent 开发规则

本文件是本仓库中供 AI 编程助手和开发者共同遵守的执行规则。详细代码风格以
[`Coding.md`](Coding.md) 为准；架构、启动方式和目录说明以 [`README.md`](README.md) 为准。
当规则与实际代码不一致时，先核对当前实现和配置，不要凭印象修改。

## 1. 项目定位与技术边界

本仓库是 pnpm workspaces + Turborepo 管理的 TypeScript Monorepo：

- `apps/web`：React 19、Vite、React Router、Zustand、Ant Design、React Flow、Fabric.js。
- `apps/api`：NestJS 11、Mongoose、Redis、BullMQ、JWT、Swagger。
- `packages/agent`：LangChain.js / LangGraph.js AI 逻辑库，由 API 通过 `@brand-flow/agent` 调用。
- `docs`：产品、模块和开发计划文档。

必须保持以下边界：

- Web 只通过 `apps/web/src/api` 调用后端，不直接依赖 `@brand-flow/agent`。
- API 负责 HTTP、鉴权、租户隔离、持久化、队列和外部基础设施编排。
- Agent 包负责 Prompt、Chain、Graph、评估、检索及生成领域逻辑，不启动 HTTP 服务。
- 跨包调用只使用包的公开导出；Agent 新增公共能力时同步维护 `packages/agent/src/index.ts` 或对应聚合出口。

## 2. 修改前必须完成的检查

开始编码前，按任务范围完成以下检查并简要说明结论：

1. 阅读相关目录、README、`Coding.md`、包级 `package.json`、TypeScript 和测试配置。
2. 沿调用链检查页面/组件、API 封装、Controller、Service、Schema、DTO、Agent 导出和文档，不能只看单个文件。
3. 检查 `git status`，区分本次改动与用户已有改动，不覆盖、不回退、不顺手格式化无关文件。
4. 明确需求、预计修改文件、复用方案、兼容性风险和验证方式。
5. 优先复用现有组件、Store、API 客户端、异常体系、DTO、工具函数和模块模式。

能够从代码、配置、日志或测试中确认的信息，不反复询问用户。只有涉及不可逆操作、生产环境、付费服务、重要数据删除、权限扩张或高风险 Git 操作时才先征求确认。

## 3. 通用编码规则

- 所有文本文件使用 UTF-8，修改时保持原编码与换行风格；代码注释使用简洁中文。
- 使用 Node.js 20+ 和仓库锁定的 `pnpm@10.29.3`；不要使用 npm 或 Yarn 改写锁文件。
- 遵循根目录 ESLint 与 Prettier 配置：2 空格、单引号、无分号、100 字符换行、尾逗号。
- 不对历史文件做任务外的大范围格式化；只保证新增和实际修改的代码符合当前配置。
- 变量和函数使用 `camelCase`，类型、类、枚举和 React 组件使用 `PascalCase`，稳定配置常量使用 `UPPER_SNAKE_CASE`。
- 类型导入使用 `import type`；导入按外部依赖、内部别名、相对路径、样式分组。
- 对外边界必须显式类型化。禁止用大面积 `any`、类型断言、`@ts-ignore` 或关闭规则绕过问题；未知输入和异常先用 `unknown`，校验后再收窄。
- 异步逻辑使用 `async/await`，错误必须保留上下文并进入项目既有错误处理链路，禁止吞异常或伪造成功结果。
- 函数和模块保持单一职责。只有存在真实复用或复杂逻辑时才抽象，避免一层无意义包装和过早通用化。
- 注释解释业务原因、边界条件或非显然决策，不复述代码；删除无效注释和长期注释掉的旧实现。
- 不硬编码密钥、Token、密码、生产地址、本机绝对路径或测试账号。新增环境变量时同步更新 `apps/api/.env.example` 和相关文档，只提交占位值。
- 不修改或提交 `node_modules`、`dist`、`.turbo`、覆盖率、日志、上传文件、模型产物或本地 `.env`。
- 不因当前需求随意新增依赖。确需新增时先确认现有依赖无法解决，并说明版本、用途、锁文件和运行环境影响。

## 4. Web 前端规则

### 4.1 组件、路由与状态

- 页面放在 `apps/web/src/pages`，布局放在 `layouts`，路由和守卫集中在 `router`，可复用 UI 放在 `components`。
- 使用函数组件，Props、事件、接口数据和组件状态都应有明确类型；事件处理函数使用 `handle` 前缀。
- 局部状态留在组件；多个页面或远距离组件共享的业务状态才进入 Zustand Store，禁止引入新的全局状态库。
- 读取 Zustand 时优先按字段 selector 订阅。持久化状态只保存刷新后确有必要的数据，结构变化时考虑旧缓存兼容或迁移。
- 路由鉴权复用 `AuthGuard` 和认证 Store，禁止只隐藏前端按钮来代替后端权限校验。
- 页面和写操作必须处理加载、空、错误、禁用、请求失败提示及重复提交防护；异步结束后状态应可靠恢复。

### 4.2 API 与 SSE

- HTTP 请求统一放在 `apps/web/src/api` 并使用现有 `apiClient`，组件内不直接创建 Axios 实例或拼接后端地址。
- `apiClient` 已解包后端 `{ success, data }`，业务代码直接处理业务数据，不依赖完整 `AxiosResponse`。
- API 入参、响应和枚举状态使用显式类型，并与后端 DTO、响应 DTO 及 `apps/api/API.md` 保持一致。
- 错误提示优先复用拦截器；页面只补充当前操作所需的上下文反馈，避免同一错误重复弹出。
- SSE 使用项目现有鉴权流式工具。SSE 不经过普通响应包装，修改事件时必须同步检查 Web `StreamEvent`、API 流、队列 progress 事件和文档。
- Effect、SSE、定时器和画布实例必须在卸载或依赖变化时清理，避免重复订阅、竞态和卸载后更新状态。

### 4.3 UI、样式与画布

- 优先使用 Ant Design 和现有公共组件，不引入第二套同类组件库。
- 页面样式使用 `*.module.css` / `*.module.less`；全局样式只放真正的基础变量、reset 或经确认的第三方组件覆盖。
- 复用 `apps/web/src/index.css` 中的颜色、阴影和圆角变量，保持现有视觉语言；不要在业务组件中散落重复的品牌色和魔法数。
- 常规布局避免内联样式。第三方组件的动态坐标、尺寸或运行时计算值可使用内联样式。
- 覆盖 Ant Design、React Flow 或 Fabric 样式时限制在当前页面/组件作用域，禁止无边界的全局裸选择器。
- React Flow 和 Fabric.js 的拖拽、缩放、指针移动等高频事件避免持续触发整页 React/Zustand 更新；实例放入 `useRef`，卸载时释放。
- 新页面应检查键盘操作、可访问名称、文本对比度和不同窗口宽度下的基本可用性。

## 5. NestJS API 规则

### 5.1 分层和契约

- 按业务域维护 `module`、`controller`、`service`、`dto`、`schemas`；不要创建跨域万能 Service。
- Controller 保持薄：负责装饰器、参数绑定、鉴权上下文和调用 Service，不写数据库查询、长事务、Prompt 或复杂业务分支。
- Service 负责业务规则和编排；可注入的依赖通过 Nest 依赖注入获得，不在方法内直接 `new`。
- 请求参数必须通过 DTO 与 `class-validator` 校验。响应结构变化时同步响应 DTO、Swagger 装饰器、`apps/api/API.md`、`rest-client` 示例以及 Web API 类型。
- 普通成功响应由全局 TransformInterceptor 包装；SSE、文件流等特殊响应保持既有豁免逻辑，不要二次包装。
- 使用项目的 `BusinessException`、Nest HTTP 异常和全局异常过滤器表达失败；不要返回伪成功对象，也不要把堆栈、密钥或底层连接信息暴露给客户端。

### 5.2 鉴权、租户与数据

- 身份和租户上下文从服务端验证后的 `req.user.sub`、`req.user.entId` 获取，不能信任客户端提交的 `userId`、`enterpriseId` 或 `ownerId` 来决定访问权限。
- 查询、更新、删除和流式订阅都必须执行同等的资源归属检查。个人空间校验用户，团队/企业空间校验成员关系、角色和企业边界。
- 新增受保护路由时复用 JWT Guard、Roles Guard 和现有权限方法；前端权限控制不能替代服务端校验。
- Mongoose ObjectId 在进入查询前校验；查询条件应包含租户/归属字段，避免先查全局记录再只在内存中筛选。
- 多步写入、对象存储、向量库和队列操作要考虑部分失败、幂等、补偿和可重试性，不能通过忽略异常制造一致性。
- 配置通过 `ConfigService` 或既有配置入口读取；新增必填配置应尽早校验并给出明确错误。

## 6. Agent 与 AI 逻辑规则

- Prompt 放在 `packages/agent/src/ai-logic/prompts`，Chain/Graph 组装放在对应目录；API Controller 和 Web 组件中禁止临时拼接大段 Prompt。
- Agent 是可复用库，不读取 Web 状态、不启动服务、不直接依赖 Nest Controller。外部服务配置和凭据由环境或调用方提供。
- Prompt 修改必须保留模板变量、输出语言、结构化输出协议和调用方依赖字段；修改前检查对应 parser、类型、fallback、评估链与 API 消费方。
- 模型返回值属于不可信输入。JSON 和结构化输出必须解析、校验并提供可诊断的失败路径，不能用断言假定字段必然存在。
- LangGraph 节点、状态、重试计数、跳过逻辑或终态变化时，同步检查 `workflow.processor.ts`、数据库节点快照、SSE 事件和 Web 状态映射。
- 保持 `pending`、`running`、`completed`、`failed`、`stale` 等状态语义一致；不要用相近字符串创建第二套状态协议。
- 调整模型、温度、阈值、最大重试、检索 topK 或 Prompt 关键约束时使用有业务含义的配置或常量，并补充对应测试/样例；不得静默改变产品语义。
- 日志记录节点、耗时、业务 ID 和错误上下文即可，不输出 API Key、Token、完整用户敏感内容、完整 Prompt 或模型私密响应。
- 新增公共能力要从稳定入口导出，并执行 Agent build，确认生成的声明可被 API 正常消费；不要手改 `dist`。

## 7. 测试与验证

验证应与风险匹配，优先执行本次改动直接相关的最小集合，再扩大范围。不得声称未实际执行的测试已通过。

常用命令：

```powershell
# 全仓
pnpm lint
pnpm build

# Web
pnpm --filter @brand-flow/web lint
pnpm --filter @brand-flow/web build

# API
pnpm --filter @brand-flow/api lint
pnpm --filter @brand-flow/api test -- --runInBand
pnpm --filter @brand-flow/api build

# Agent
pnpm --filter @brand-flow/agent lint
pnpm --filter @brand-flow/agent build
```

执行要求：

- Web 改动至少运行对应 lint；涉及类型、路由、构建配置或跨模块导入时运行 Web build。
- API 改动至少运行对应 lint 和相关 Jest；涉及模块装配、DTO、Agent 依赖或构建配置时运行 API build。
- Agent 改动至少运行 Agent lint 和 build；被 API 消费的契约变化还要验证 API build。
- 跨 Web/API/Agent 的接口或工作流变更要进行端到端契约核对，必要时使用 `apps/api/rest-client` 做真实接口冒烟测试。
- 仅修改 Markdown 或规则文件时，检查 UTF-8、链接、frontmatter 和 `git diff --check` 即可，不必启动 Docker 或业务服务。
- 测试失败时先判断是否为本次改动引起；不得删除、跳过、放宽断言或屏蔽规则来获得绿色结果。

若受环境、外部服务、数据、权限或硬件限制无法验证，必须报告未执行项、原因、替代检查和后续可运行命令。

## 8. Git 与交付

- 修改前后都检查 `git status` 和 `git diff`，提交范围只包含当前任务。
- 未经明确授权，不执行 `git push --force`、`git reset --hard`、`git clean -fd`、`git rebase`、强删分支或任何历史重写。
- 提交信息使用 Conventional Commits：`<type>(<scope>): <简洁中文说明>`。
- 不自动提交或推送，除非用户明确要求。
- 完成后简洁报告：完成内容、主要文件、关键逻辑、执行命令与结果、依赖/环境变化、Git 操作、已知风险和未完成事项。
