import type { WorkflowNodeId, WorkflowStatus } from '@brand-flow/common'

export const NODE_LABELS: Record<WorkflowNodeId, string> = {
  intent: '意图解析',
  'brand-kb': '品牌知识库',
  prompt: 'Prompt 专家',
  'image-gen': '图像生成',
  compose: '排版合成',
  eval: '自我评估',
}

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
}

export function truncateText(text: string, max = 24): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
