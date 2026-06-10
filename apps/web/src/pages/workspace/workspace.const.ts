export const WORKSPACE_VIEW_TABS = ['节点流视图', '画板']

export const WORKSPACE_SIDE_TABS = ['知识资产', '历史记录']

export const WORKSPACE_GROUP_OPTIONS = [
  { key: 'member', icon: '👥', label: '项目组（成员视角）' },
  { key: 'personal', icon: '🏠', label: '个人知识库' },
  { key: 'admin', icon: '👑', label: '项目组（管理员视角）' },
]

export const WORKSPACE_HISTORY_RECORDS = [
  {
    id: 'history-preview',
    tag: '画板预览',
    time: '刚刚',
    title: '海报_v1 生成记录',
    description: '已调用品牌资产与标准 Logo 输出预览结果',
  },
  {
    id: 'history-search',
    tag: '节点流视图',
    time: '10 分钟前',
    title: '项目组知识库检索',
    description: '查看"品牌规范 / 颜色 / Logo"相关引用链路',
  },
  {
    id: 'history-switch',
    tag: '成员操作',
    time: '今天 09:12',
    title: '个人知识库切换记录',
    description: '从项目组切换到个人知识库并查看最近内容',
  },
]

export const WORKSPACE_ASSET_ITEMS = [
  {
    id: 'asset-brand-blue',
    type: 'color' as const,
    label: '品牌蓝 #0022AB',
    value: '#0022AB',
  },
  {
    id: 'asset-logo-white',
    type: 'file' as const,
    label: '标准白底 Logo.svg',
    badge: 'Luckin',
  },
]

/** 右侧属性面板 —— 默认标签 */
export const DEFAULT_TAGS = ['品牌蓝', '标准Logo', '品牌元素']

/** 右侧属性面板 —— 滑杆默认值 */
export const SLIDER_CONFIG = {
  min: 0,
  max: 100,
  defaultValue: 70,
  label: '匹配逻辑阈值',
  unit: '%',
  rangeLabels: ['宽泛', '精准'],
}

/** 节点流节点定义 */
export type FlowNodeId = 'intent' | 'brand-kb' | 'prompt' | 'image-gen' | 'compose' | 'eval'

export type NodeExecStatus = 'done' | 'running' | 'pending'
export type LayoutDir = 'vertical' | 'horizontal'

export interface FlowNodeDefinition {
  id: FlowNodeId
  type: 'input' | 'process' | 'output'
  step: string
  title: string
  emoji: string
  subtitle: string
  execStatus: NodeExecStatus
}

export const FLOW_NODES: FlowNodeDefinition[] = [
  {
    id: 'intent',
    type: 'input',
    step: '1',
    title: '意图解析',
    emoji: '🧩',
    subtitle: '主题/风格',
    execStatus: 'done',
  },
  {
    id: 'brand-kb',
    type: 'process',
    step: '2',
    title: '知识匹配',
    emoji: '📦',
    subtitle: '品牌资产',
    execStatus: 'pending',
  },
  {
    id: 'prompt',
    type: 'process',
    step: '3',
    title: 'Prompt专家',
    emoji: '✍️',
    subtitle: '绘图指令',
    execStatus: 'pending',
  },
  {
    id: 'image-gen',
    type: 'process',
    step: '4',
    title: '图像生成',
    emoji: '🎨',
    subtitle: '生成底图',
    execStatus: 'pending',
  },
  {
    id: 'compose',
    type: 'process',
    step: '5',
    title: '排版合成',
    emoji: '📐',
    subtitle: '文字/LOGO',
    execStatus: 'pending',
  },
  {
    id: 'eval',
    type: 'output',
    step: '6',
    title: '自我评估',
    emoji: '✅',
    subtitle: '质检评分',
    execStatus: 'pending',
  },
]
