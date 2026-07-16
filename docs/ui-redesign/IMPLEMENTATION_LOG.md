# UI/UX 重构实施记录

> 实施日期：2026-07-16  
> 当前分支：`codex/UI`

## Phase 1：审计与设计规范

- 修改内容：完成页面、路由、Store、API、React Flow、样式、图标、边界状态、响应式和可访问性审计；输出语义 Token 与组件规范。
- 设计理由：先锁定信息架构、业务边界和高风险链路，避免从局部视觉样式反推产品结构。
- 涉及文件：`UI_AUDIT.md`、`DESIGN_SYSTEM.md`。
- 风险：业务文档规划为 7 节点，当前后端和前端真实执行仍以 6 节点过渡模型为主。
- 尚未完成：浏览器基线截图和正式的设计验收记录。

## Phase 2：基础设计系统

- 修改内容：建立颜色与 Motion Token、CSS Variables、Ant Design `ConfigProvider` 主题、`StatusBadge` 与 `IconButton`；加入统一 focus ring 和 reduced-motion 规则。
- 设计理由：让 Ant Design 与自定义组件共享同一语义层，减少业务页面中的硬编码颜色和无规律视觉值。
- 涉及文件：`apps/web/src/design-system/`、`apps/web/src/main.tsx`、`apps/web/src/index.css`。
- 风险：旧页面仍通过兼容变量使用原样式；这些别名需在后续页面逐个迁移后删除。
- 尚未完成：`EmptyState`、`ErrorState`、`LoadingState`、`AsyncButton` 的项目级封装。

## Phase 3：Workspace 重构

- 修改内容：新增专业工作台顶栏、资源与节点面板、统一画布工具栏、状态化节点卡、可收起 Inspector、底部执行状态栏；修复 Space 硬编码；执行边仅在 running 状态动画；移除工作台正式操作中的 Emoji。
- 设计理由：将工作流名称、全局操作、节点选择、节点配置和执行状态分层，保持用户对当前任务和当前节点的双重上下文。
- 涉及文件：`workspace.tsx`、`workspace.module.css`、`workspace.const.ts`、`FlowView.tsx`、`FlowNode.tsx` 及其 CSS Module、各节点面板。
- 风险：撤销、重做、历史、详细日志和费用没有后端契约，当前明确显示为禁用项；没有使用假数据伪装能力。
- 尚未完成：7 节点“创意方案”真实接入、作品保存、版本历史、费用计算、Fabric 精修和完整日志。

## Phase 4：核心页面统一

- 修改内容：重构应用主导航与自适应侧栏；接回知识库列表与详情路由；修复首页退出与 Space 下拉触发；统一页面使用的 Ant Design Theme；补齐知识项 API 类型和请求封装。
- 设计理由：登录后信息架构应支持首页、工作台、知识库、品牌资产和个人中心之间的稳定切换。
- 涉及文件：`AppLayout.tsx`、`router/index.tsx`、`home.tsx`、知识库页面与 API、认证相关小范围清理。
- 风险：品牌资产页面仍是占位结构；素材上传组件仍处于接口 TODO 状态，因此没有在本次重构中伪装为已接通。
- 尚未完成：作品中心/详情、正式导出、品牌资产真实列表、首页最近项目与模板的真实数据接入。

## Phase 5：测试与收尾

- `pnpm.cmd --filter @brand-flow/web lint`：通过。
- `pnpm.cmd --filter @brand-flow/web build`：通过。
- Vite production bundle：生成成功；主 JS chunk 约 1.1 MB，仍有大于 500 kB 的拆包提示。
- 本地启动：Vite 在 `http://127.0.0.1:5174` 启动成功（5173 已被占用）。
- 路由可达性：`/`、`/login`、`/home`、`/workspace`、`/knowledge`、`/brand`、`/profile` 均返回 200 且包含 React root。
- 浏览器视觉回归：当前会话缺少 Chrome 控制插件要求的运行接口，未能执行真实点击、控制台检查、1024/1280/1440 截图与前后对比。
- Conda：未创建；本次仅使用仓库现有 Node.js / pnpm 依赖。

## 功能兼容结论

- 未修改 API URL、认证流程和 Zustand 业务字段含义。
- 保留 Workspace 的 SSE、断线恢复、节点编辑、节点重跑、图片预览和下载逻辑。
- `stale` 仍沿用现有完成态兼容逻辑；`skipped` 已能保留为独立可读状态。
- 补齐的知识库 API 与现有 NestJS Controller 路径一致：`/knowledge/:id/items`。

## 下一步建议

1. 后端、Agent 与 Web 联合冻结 7 节点事件 Schema，再接入“创意方案”和完整状态集。
2. 对 Workspace 和首页执行 1024、1280、1440 三档浏览器截图回归，并补充键盘与 axe 检查。
3. 使用路由级动态 import 拆分 Workspace、知识库与品牌模块，解决 1.1 MB 主包警告。
4. 优先完成作品保存、作品详情和正式导出，形成从创作到交付的产品闭环。
