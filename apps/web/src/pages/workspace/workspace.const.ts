import type { WorkflowNodeId } from '@brand-flow/common'

export interface FlowNodeDefinition {
  id: WorkflowNodeId
  step: string
  title: string
  subtitle: string
  icon: string
  x: number
  y: number
}

export const FLOW_NODES: FlowNodeDefinition[] = [
  {
    id: 'intent',
    step: '1',
    title: '意图解析',
    subtitle: '主题 / 场景 / 风格',
    icon: '🧠',
    x: 60,
    y: 100,
  },
  {
    id: 'brand-kb',
    step: '2',
    title: '知识匹配',
    subtitle: '品牌资产检索',
    icon: '📚',
    x: 360,
    y: 100,
  },
  {
    id: 'prompt',
    step: '3',
    title: 'Prompt 专家',
    subtitle: '英文绘图指令',
    icon: '✍️',
    x: 660,
    y: 100,
  },
  {
    id: 'image-gen',
    step: '4',
    title: '图像生成',
    subtitle: '生成底图',
    icon: '🎨',
    x: 660,
    y: 340,
  },
  {
    id: 'compose',
    step: '5',
    title: '排版合成',
    subtitle: '文字 / Logo',
    icon: '🧩',
    x: 360,
    y: 340,
  },
  { id: 'eval', step: '6', title: '自我评估', subtitle: '质检评分', icon: '✅', x: 60, y: 340 },
]

export const FLOW_EDGES = [
  {
    source: 'intent',
    target: 'brand-kb',
    sourceHandle: 'right-source',
    targetHandle: 'left-target',
  },
  {
    source: 'brand-kb',
    target: 'prompt',
    sourceHandle: 'right-source',
    targetHandle: 'left-target',
  },
  {
    source: 'prompt',
    target: 'image-gen',
    sourceHandle: 'bottom-source',
    targetHandle: 'right-target',
  },
  {
    source: 'image-gen',
    target: 'compose',
    sourceHandle: 'left-source',
    targetHandle: 'right-target',
  },
  {
    source: 'compose',
    target: 'eval',
    sourceHandle: 'left-source',
    targetHandle: 'right-target',
  },
] as const
