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

export const KNOWLEDGE_TYPES = [
  'brand_profile',
  'visual_guideline',
  'asset',
  'product',
  'reference_case',
  'negative_rule',
  'layout_rule',
] as const

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number]

export const SCENE_TYPES = [
  'brand_poster',
  'product_image',
  'xiaohongshu_cover',
  'wechat_banner',
  'general',
] as const

export type SceneType = (typeof SCENE_TYPES)[number]

export const IMAGE_RATIOS = ['1:1', '3:4', '16:9', '1024x1024'] as const

export type ImageRatio = (typeof IMAGE_RATIOS)[number]

export interface BrandProfileContent {
  brandName?: string
  slogan?: string
  industry?: string
  targetAudience?: string
  brandKeywords?: string[]
  forbiddenKeywords?: string[]
  description?: string
}

export interface VisualGuidelineContent {
  primaryColors?: string[]
  secondaryColors?: string[]
  forbiddenColors?: string[]
  fontStyle?: string
  visualStyle?: string
  compositionPreference?: string
  lightingPreference?: string
  texturePreference?: string
}

export interface AssetContent {
  assetName?: string
  assetType?: 'logo' | 'product_image' | 'icon' | 'mascot' | 'package' | 'other'
  assetUrl?: string
  usage?: string
  isDefault?: boolean
  tags?: string[]
}

export interface ProductContent {
  productName?: string
  productDescription?: string
  sellingPoints?: string[]
  scenario?: string
  priceInfo?: string
  productImageUrl?: string
  tags?: string[]
}

export interface ReferenceCaseContent {
  caseName?: string
  imageUrl?: string
  preference?: 'like' | 'dislike'
  reason?: string
  styleTags?: string[]
  notes?: string
}

export interface NegativeRuleContent {
  ruleTitle?: string
  ruleContent?: string
  forbiddenElements?: string[]
  forbiddenStyles?: string[]
  forbiddenScenes?: string[]
  forbiddenCopywriting?: string[]
  severity?: 'low' | 'medium' | 'high'
}

export interface LayoutRuleContent {
  ruleTitle?: string
  logoPosition?: string
  titlePosition?: string
  productPosition?: string
  qrcodePosition?: string
  safeArea?: string
  posterRatio?: string
  marginRule?: string
}

export type KnowledgeContent =
  | BrandProfileContent
  | VisualGuidelineContent
  | AssetContent
  | ProductContent
  | ReferenceCaseContent
  | NegativeRuleContent
  | LayoutRuleContent

export interface KnowledgeItem {
  id: string
  spaceId: string
  type: KnowledgeType
  title: string
  description?: string
  tags: string[]
  content: KnowledgeContent
  assetUrl?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ListKnowledgeQuery {
  spaceId: string
  type?: KnowledgeType
  enabled?: boolean
  keyword?: string
  tags?: string
}

export interface CreateKnowledgeRequest {
  spaceId: string
  type: KnowledgeType
  title: string
  description?: string
  tags?: string[]
  content: KnowledgeContent
  assetUrl?: string
  enabled?: boolean
}

export interface UpdateKnowledgeRequest {
  title?: string
  description?: string
  tags?: string[]
  content?: KnowledgeContent
  assetUrl?: string
  enabled?: boolean
}

export interface SetKnowledgeEnabledRequest {
  enabled: boolean
}

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
  imageRatio?: ImageRatio
  sceneType?: SceneType
  useKnowledge?: boolean
  brandProfileId?: string
  modelInfo?: string
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
    sceneType?: SceneType
  }
  'brand-kb'?: {
    knowledgeContext?: string
    brandAssets?: BrandAsset[]
    matchedSummary?: string
    useKnowledge?: boolean
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
  sceneType?: SceneType
  imageRatio?: ImageRatio
  useKnowledge?: boolean
  brandProfileId?: string
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
