/** 节点流节点定义 */
export type FlowNodeId =
  | 'brief'
  | 'brandConstraint'
  | 'creativeDirection'
  | 'prompt'
  | 'generate'
  | 'compose'
  | 'finalEvaluation'

export type NodeExecStatus =
  | 'unconfigured'
  | 'ready'
  | 'pending'
  | 'queued'
  | 'running'
  | 'done'
  | 'warning'
  | 'failed'
  | 'skipped'
  | 'stale'
export type LayoutDir = 'vertical' | 'horizontal'

export interface FlowNodeDefinition {
  id: FlowNodeId
  type: 'input' | 'process' | 'output'
  step: string
  title: string
  subtitle: string
  execStatus: NodeExecStatus
}

export const FLOW_NODES: FlowNodeDefinition[] = [
  {
    id: 'brief',
    type: 'input',
    step: '1',
    title: '需求理解',
    subtitle: '识别目标、场景与表达意图',
    execStatus: 'done',
  },
  {
    id: 'brandConstraint',
    type: 'process',
    step: '2',
    title: '品牌约束',
    subtitle: '检索品牌规则与可用资产',
    execStatus: 'pending',
  },
  {
    id: 'creativeDirection',
    type: 'process',
    step: '3',
    title: '创意方案',
    subtitle: '生成并选择三个差异方向',
    execStatus: 'pending',
  },
  {
    id: 'prompt',
    type: 'process',
    step: '4',
    title: 'Prompt 规划',
    subtitle: '生成结构化绘图指令',
    execStatus: 'pending',
  },
  {
    id: 'generate',
    type: 'process',
    step: '5',
    title: '候选图生成',
    subtitle: '调用模型生成视觉底图',
    execStatus: 'pending',
  },
  {
    id: 'compose',
    type: 'process',
    step: '6',
    title: '排版合成',
    subtitle: '组合文字、Logo 与版式',
    execStatus: 'pending',
  },
]
