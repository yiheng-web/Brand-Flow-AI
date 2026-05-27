export interface ApiResponse<T = unknown> {
  success: boolean
  statusCode: number
  message: string
  data: T
  path?: string
  timestamp?: string
  errorCode?: number
}

export const WORKFLOW_NODE_IDS = [
  'intent',
  'brand-kb',
  'prompt',
  'image-gen',
  'compose',
  'eval',
] as const

export type WorkflowNodeId = (typeof WORKFLOW_NODE_IDS)[number]

export type NodeStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed'

export type KnowledgeScope = 'personal' | 'team'

export interface BrandAsset {
  id: string
  type: 'color' | 'logo' | 'font' | 'image' | 'text'
  label: string
  value: string
  selected: boolean
}

export interface ImageParams {
  model: string
  seed?: number
  steps?: number
  size: string
}

export interface ComposeLayer {
  id: string
  type: 'image' | 'text' | 'logo'
  label: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  content?: string
  url?: string
}

export interface EvaluationReport {
  score: number
  passed: boolean
  feedback: string[]
  targetRetryNode?: WorkflowNodeId
  thinking: string[]
}

export interface WorkflowSessionContext {
  prompt?: string
  spaceId?: string
  scope?: KnowledgeScope
  tags?: string[]
  brandAssets?: BrandAsset[]
  positivePrompt?: string
  negativePrompt?: string
  imageModel?: string
  imageSize?: string
  headline?: string
  [key: string]: unknown
}

export interface NodeResultMap {
  intent?: {
    intent?: string
    confidence?: number
    reason?: string
    suggestedAction?: string
    tags?: string[]
  }
  'brand-kb'?: {
    knowledgeContext?: string
    brandAssets?: BrandAsset[]
  }
  prompt?: {
    positivePrompt?: string
    negativePrompt?: string
    finalPrompt?: string
  }
  'image-gen'?: {
    baseImageUrl?: string
    imageParams?: ImageParams
  }
  compose?: {
    finalImageUrl?: string
    layers?: ComposeLayer[]
  }
  eval?: EvaluationReport
}

export interface WorkflowDto {
  id: string
  status: WorkflowStatus
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: Record<string, unknown>
  sessionContext: WorkflowSessionContext
  nodeStates: Partial<Record<WorkflowNodeId, NodeStatus>>
  activeNodeId?: WorkflowNodeId
  rerunHistory?: WorkflowRerunRecord[]
  errorMessage?: string
}

export interface WorkflowRerunRecord {
  rerunFromNodeId: WorkflowNodeId
  requestedAt: string
}

export interface CreateWorkflowRequest {
  prompt: string
  spaceId: string
  scope?: KnowledgeScope
}

export interface RerunWorkflowRequest {
  rerunFromNodeId: WorkflowNodeId
  sessionContext: WorkflowSessionContext
}

export interface WorkflowStreamEvent {
  type:
    | 'connected'
    | 'node_started'
    | 'node_completed'
    | 'node_failed'
    | 'evaluation_thinking'
    | 'workflow_completed'
    | 'completed'
    | 'failed'
    | 'progress'
  workflowId?: string
  nodeId?: WorkflowNodeId
  data?: unknown
  error?: string
}

export interface TeamMemberDto {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  isSelf?: boolean
}

export interface TeamDto {
  id: string
  name: string
  hasTeam: boolean
  role: 'admin' | 'member' | 'personal'
  members: TeamMemberDto[]
}

export interface InviteCodeDto {
  code: string
  expiresAt: string
}

export interface JoinTeamRequest {
  code: string
}

export interface KnowledgeBaseDto {
  id: string
  name: string
  description: string
  scope: KnowledgeScope
  assetCount: number
  assetLimit: number
  color: string
  assets: BrandAsset[]
}

export interface KnowledgeQuotaDto {
  scope: KnowledgeScope
  used: number
  limit: number
  assetLimitPerBase: number
}

export interface KnowledgeOverviewDto {
  quota: KnowledgeQuotaDto
  bases: KnowledgeBaseDto[]
}
