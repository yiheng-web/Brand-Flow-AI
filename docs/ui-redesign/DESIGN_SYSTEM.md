# Brand-Flow AI Design System

## 1. 设计原则

1. **过程透明**：工作流状态、输入、输出和失败原因始终可定位。
2. **主操作明确**：每个页面只有一个最主要的下一步，危险操作不与主操作并列。
3. **克制的层级**：优先用背景、边框与留白建立结构，阴影只服务于浮层、拖拽和选中态。
4. **状态不只靠颜色**：状态同时具备图标、文字、颜色和必要的解释。
5. **上下文不断裂**：节点配置优先在 Inspector 内完成，减少打断式 Modal。
6. **真实边界状态**：加载、空、错、禁用和成功状态均有稳定组件，不以假数据填充页面。

## 2. 信息架构

### 应用级

- 首页：继续最近工作、快速创作、模板与最近结果。
- 工作台：节点资源、Flow 画布、Inspector、执行摘要与日志。
- 知识库：可检索的品牌知识与规则。
- 品牌资产：Logo、色彩、字体、素材与禁用规则。
- 作品：生成结果、版本、质检和导出。
- 个人中心：账户、Space、团队和偏好。

### Workspace

```text
顶部：工作流名称 / 保存状态 / 撤销重做 / 历史 / 帮助 / 预览 / 导出 / 运行
主体：左侧资源栏 | 中央 Flow 画布 | 右侧 Inspector
底部：执行阶段 / 总进度 / 队列 / 耗时 / 模型 / 费用 / 日志入口
```

在 1024px 下左栏默认折叠，Inspector 以可开关侧栏呈现；更窄视口显示桌面端建议，但不遮挡保存、返回和运行等关键操作。

## 3. Design Tokens

### 色彩

| 语义     | CSS Variable                | 值        |
| -------- | --------------------------- | --------- |
| 页面背景 | `--color-bg-page`           | `#F7F8FA` |
| 表面     | `--color-bg-surface`        | `#FFFFFF` |
| 容器     | `--color-bg-container`      | `#F0F4F9` |
| 高层容器 | `--color-bg-container-high` | `#E9EEF6` |
| 主色     | `--color-primary`           | `#0B57D0` |
| 主色悬浮 | `--color-primary-hover`     | `#0842A0` |
| 主色容器 | `--color-primary-container` | `#D3E3FD` |
| 主文本   | `--color-text-primary`      | `#1F1F1F` |
| 次文本   | `--color-text-secondary`    | `#5F6368` |
| 弱文本   | `--color-text-tertiary`     | `#80868B` |
| 边框     | `--color-border`            | `#DADCE0` |
| 成功     | `--color-success`           | `#137333` |
| 警告     | `--color-warning`           | `#B06000` |
| 错误     | `--color-error`             | `#B3261E` |
| 信息     | `--color-info`              | `#0B57D0` |

业务组件禁止新增无语义的品牌色值。数据可视化或第三方画布必须使用色值时，从 TypeScript Token 导出读取。

### Typography

| 层级     | 字号 / 行高 | 字重 |
| -------- | ----------- | ---- |
| 页面标题 | 26 / 34px   | 600  |
| 模块标题 | 20 / 28px   | 600  |
| 卡片标题 | 16 / 24px   | 600  |
| 正文     | 14 / 22px   | 400  |
| 辅助文本 | 12 / 18px   | 400  |
| 按钮     | 14 / 20px   | 500  |

字体栈：`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`。不加载外部字体。

### 间距

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px`，映射为 `--space-1` 到 `--space-10`。

### 圆角

- `--radius-control: 10px`：输入、按钮、菜单项。
- `--radius-card: 16px`：普通卡片。
- `--radius-node: 18px`：工作流节点。
- `--radius-panel: 20px`：大型面板与抽屉。
- `--radius-pill: 999px`：状态与筛选标签。

### 阴影

- `--shadow-float`：菜单、Popover、悬浮工具栏。
- `--shadow-selected`：选中节点，以主色外环为主。
- 普通卡片默认无阴影，仅使用边框。

### Motion

- `--motion-fast: 140ms`
- `--motion-normal: 200ms`
- `--motion-slow: 280ms`
- 缓动：`cubic-bezier(0.2, 0, 0, 1)`
- `prefers-reduced-motion: reduce` 时关闭非必要动画和滚动行为。

## 4. Ant Design 主题映射

`ConfigProvider` 统一设置 `colorPrimary`、背景、文本、边框、圆角、字号、控件高度、focus outline 与组件级 Button / Input / Card / Modal / Tooltip Token。页面不通过全局裸标签选择器覆盖 Ant Design 内部 DOM。

## 5. 组件规范

### AppShell / TopAppBar / SideNavigation

- AppShell 只负责全局导航和内容视口，不包含页面业务状态。
- 当前路由由 `location.pathname` 推导，不保存重复的 active state。
- 折叠按钮、导航项和用户入口均可键盘访问，并具有辅助名称。

### PageHeader / SectionHeader

- 标题和说明置左，主操作置右。
- 面包屑、返回与危险操作按需出现，不为视觉平衡添加无效按钮。

### StatusBadge

统一状态：`unconfigured / ready / queued / running / success / warning / failed / skipped`。每个状态提供图标、文案、语义颜色和容器色；running 可使用受控旋转图标，其他状态不持续动画。

### FlowNodeCard

- 标题、类型图标、描述、状态与输入输出摘要具有固定位置。
- selected、hover、dragging、disabled 状态不可混淆。
- Handle 与边使用同一语义 Token；只有 running → 下一节点的执行路径允许动画。
- 快捷操作使用 IconButton + Tooltip，不使用 Emoji。

### EmptyState / LoadingState / ErrorState

- Empty：说明当前为空的原因，并只提供一个最合适的下一步。
- Loading：优先 Skeleton 保持结构；无法预测布局时使用居中 Spin + 文案。
- Error：用户可理解的原因、重试按钮和必要的诊断编号；不直接展示堆栈。

### AsyncButton / ConfirmAction

- 提交时锁定重复操作并保留按钮宽度。
- 高风险操作使用确认组件，确认文案明确说明对象与后果。

## 6. 可访问性

- 所有图标按钮必须有 Tooltip 与 `aria-label`。
- 自定义交互元素优先使用 `button`、`a`、`input` 等原生语义。
- 全局 `:focus-visible` 使用 2px 主色外环和 2px offset。
- 节点状态、错误与进度使用文字或 `aria-live` 补充视觉变化。
- Modal / Drawer 依赖 Ant Design 的焦点管理；自制灯箱必须提供 dialog 语义和 Escape 关闭。

## 7. 实施边界

- 设计系统只管理视觉语义和稳定 UI 结构，不包含 API 调用和工作流业务分支。
- 不迁移到 MUI，不引入额外图标库、动效库或 CSS-in-JS 运行时。
- 新组件在至少两个场景复用或职责长期稳定时才抽取。
- 与后端未对齐的 7 节点、作品保存和 Fabric 精修不使用假数据伪装完成。
