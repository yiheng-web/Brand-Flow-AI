export const WORKFLOW_QUEUE = 'workflow'
export const RUN_WORKFLOW_JOB = 'run-workflow'

export const WORKFLOW_NODE_IDS = [
  'intent',
  'brand-kb',
  'prompt',
  'image-gen',
  'compose',
  'eval',
] as const

export type WorkflowNodeId = (typeof WORKFLOW_NODE_IDS)[number]
export type WorkflowNodeStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'

export const DEFAULT_NODE_STATES: Record<WorkflowNodeId, WorkflowNodeStatus> = {
  intent: 'PENDING',
  'brand-kb': 'PENDING',
  prompt: 'PENDING',
  'image-gen': 'PENDING',
  compose: 'PENDING',
  eval: 'PENDING',
}

export const AGENT_NODE_TO_WORKFLOW_NODE: Record<string, WorkflowNodeId> = {
  intentNode: 'intent',
  knowledgeNode: 'brand-kb',
  promptNode: 'prompt',
  generateNode: 'image-gen',
  composeNode: 'compose',
  evaluateNode: 'eval',
}
