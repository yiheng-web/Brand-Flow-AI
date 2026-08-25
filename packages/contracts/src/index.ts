export type SpaceType = 'personal' | 'team' | 'enterprise'

export type WorkflowNodeType =
  | 'brief'
  | 'brandConstraint'
  | 'creativeDirection'
  | 'prompt'
  | 'generate'
  | 'compose'
  | 'finalEvaluation'

export type WorkflowNodeStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'stale'

export type WorkflowStatus = 'pending' | 'running' | 'awaiting_user' | 'completed' | 'failed'

export type WorkflowAwaitingAction =
  | 'confirm_brief'
  | 'select_direction'
  | 'select_candidate'
  | 'enter_art_text'
  | 'select_art_text'
  | 'select_art_text_region'

export const WORKFLOW_NODE_ORDER: readonly WorkflowNodeType[] = [
  'brief',
  'brandConstraint',
  'creativeDirection',
  'prompt',
  'generate',
  'compose',
  'finalEvaluation',
] as const

export const WORKFLOW_NODE_LABELS: Record<WorkflowNodeType, string> = {
  brief: '需求理解',
  brandConstraint: '品牌约束',
  creativeDirection: '创意方案',
  prompt: 'Prompt 规划',
  generate: '候选图生成',
  compose: '图文合成',
  finalEvaluation: '最终品牌质检',
}

const LEGACY_NODE_TYPE_MAP: Record<string, WorkflowNodeType> = {
  intentNode: 'brief',
  knowledgeNode: 'brandConstraint',
  creativeDirectionNode: 'creativeDirection',
  promptNode: 'prompt',
  generateNode: 'generate',
  image_generation: 'generate',
  composeNode: 'compose',
  composition: 'compose',
  evaluateNode: 'finalEvaluation',
  finishNode: 'finalEvaluation',
  brand_evaluation: 'finalEvaluation',
  brand_constraint: 'brandConstraint',
  creative_direction: 'creativeDirection',
}

export function normalizeWorkflowNodeType(value: string): WorkflowNodeType | undefined {
  return WORKFLOW_NODE_ORDER.includes(value as WorkflowNodeType)
    ? (value as WorkflowNodeType)
    : LEGACY_NODE_TYPE_MAP[value]
}

export interface TextIntent {
  headline?: string
  subheadline?: string
  body?: string
  callToAction?: string
}

export const BRAND_VISUAL_STYLES = ['极简', '高端', '科技', '国潮', '潮流', '复古'] as const
export type BrandVisualStyle = (typeof BRAND_VISUAL_STYLES)[number]

export const IMAGE_ASPECT_RATIOS = ['1:1', '4:5', '3:4', '16:9', '9:16'] as const
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number]

export interface BrandRequirementInput {
  brandName: string
  productCategory: string
  productDescription: string
  targetAudience: string
  usageScenario: string
  visualStyles: BrandVisualStyle[]
  colorPreference?: string
  aspectRatio: ImageAspectRatio
}

export interface CreativeBrief {
  originalRequest: string
  normalizedIntent: string
  targetAudience?: string
  channel?: string
  outputMode: 'pure_image' | 'graphic_design' | 'scene_text' | 'both'
  needsComposition: boolean
  textIntent?: TextIntent
  constraints: string[]
  assumptions: string[]
}

export interface BrandConstraint {
  id: string
  title: string
  description: string
  sourceKnowledgeBaseId?: string
  sourceItemId?: string
}

export interface BrandConstraintPackage {
  required: BrandConstraint[]
  recommended: BrandConstraint[]
  optional: BrandConstraint[]
  sources: Array<{
    knowledgeBaseId: string
    itemId?: string
    title?: string
  }>
}

export interface CreativeDirection {
  id: string
  name: string
  concept: string
  visualKeywords: string[]
  applicableScenes: string[]
  reason: string
  risk: string
  /** 兼容历史工作流，并继续承载生图细节。 */
  title: string
  summary: string
  visualStyle: string
  composition: string
  colorStrategy: string
  visualFocus: string
  mood: string
  copyStyle: string
  channels: string[]
}

export interface BriefReview {
  status: 'pending' | 'confirmed'
  source: 'generated' | 'user_modified'
  version: number
  confirmedAt?: string
}

export type OptimizationCategory = 'style' | 'color' | 'subject' | 'composition' | 'text'

export interface OptimizationFeedback {
  categories: OptimizationCategory[]
  instruction: string
  sourceCandidateId: string
  preserveBrandPositioning: true
  preserveCoreSubject: true
}

export interface WorkflowRevisionSnapshot {
  id: string
  round: number
  feedback: OptimizationFeedback
  previousPrompt: PromptPlan
  revisedPrompt: PromptPlan
  status: 'queued' | 'completed' | 'failed'
  createdAt: string
}

export interface PromptPlan {
  selectedDirectionId: string
  imagePrompt: string
  negativePrompt?: string
  stylePrompt?: string
  layoutPlan?: {
    canvasRatio: string
    safeArea?: string
    textRegions?: Array<{
      role: string
      content: string
      position: string
      emphasis?: string
    }>
  }
  generationConfig: {
    width?: number
    height?: number
    aspectRatio?: string
    seed?: number
  }
}

export interface CandidateImage {
  id: string
  imageUrl: string
  thumbnailUrl?: string
  seed?: number
  prompt: string
  model?: string
  metadata?: Record<string, unknown>
}

export interface CandidateEvaluation {
  candidateId: string
  totalScore: number
  scores: {
    brandConsistency: number
    promptAlignment: number
    composition: number
    visualQuality: number
    textReadability?: number
  }
  strengths: string[]
  issues: string[]
  recommended: boolean
  recommendationReason: string
  source?: 'model' | 'fallback'
}

export interface ArtTextGenerationInput {
  baseCandidateId: string
  textContent: string
  stylePrompt: string
}

export interface ArtTextShadow {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

export interface ArtTextGradient {
  from: string
  to: string
  angle: number
}

export interface ArtTextDecoration {
  type: 'line' | 'shape' | 'highlight'
  color: string
}

export interface ArtTextVectorSpec {
  fontFamily: string
  fontWeight: number
  textAlign: 'left' | 'center' | 'right'
  fill: string
  stroke?: string
  strokeWidth?: number
  shadow?: ArtTextShadow
  gradient?: ArtTextGradient
  decorations?: ArtTextDecoration[]
}

export interface ArtTextCandidate {
  id: string
  textContent: string
  previewUrl: string
  vectorSpec: ArtTextVectorSpec
  styleSummary: string
  dominantColors: string[]
  source: 'demo' | 'model'
}

export interface ArtTextRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ArtTextPlacementPlan {
  region: ArtTextRegion
  scale: number
  rotation: number
  horizontalAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  opacity: number
  blendMode: 'normal' | 'multiply' | 'screen'
  contrastEnhancement?: {
    type: 'shadow' | 'stroke' | 'backplate'
    color: string
    strength: number
  }
}

export interface CompositionLayer {
  id: string
  type: 'background' | 'art_text' | 'backplate' | 'logo'
  name: string
  visible: boolean
  locked: boolean
  region: ArtTextRegion
  content?: string
  candidateId?: string
  vectorSpec?: ArtTextVectorSpec
}

export interface CompositionOutput {
  baseCandidateId: string
  selectedArtTextCandidateId: string
  textContent: string
  stylePrompt: string
  placement: ArtTextPlacementPlan
  layers: CompositionLayer[]
  finalImageUrl: string
  objectKey: string
  integrity: {
    sha256: string
    renderer: 'fabric-v1'
    baseObjectKey: string
    pixelRegionVerified: boolean
  }
  exportSettings: {
    width: number
    height: number
    format: 'png'
  }
}

export interface ArtTextCompositionDraft {
  baseCandidateId: string
  textContent: string
  stylePrompt: string
  candidates: ArtTextCandidate[]
  selectedArtTextCandidateId?: string
  region?: ArtTextRegion
  placement?: ArtTextPlacementPlan
}

export interface FinalEvaluationResult {
  totalScore: number
  passed: boolean
  scores: {
    brandConsistency: number
    requirementAlignment: number
    composition: number
    visualQuality: number
    textReadability?: number
  }
  deductions: Array<{
    dimension: string
    points: number
    reason: string
  }>
  strengths: string[]
  suggestions: string[]
  traceBack?: Array<{
    targetNode: WorkflowNodeType
    reason: string
    recommendedAction: string
  }>
}

export interface WorkflowError {
  code: string
  message: string
  retryable?: boolean
  attempt?: number
  maxAttempts?: number
  nodeType?: WorkflowNodeType
}

export interface WorkflowNodeSnapshot {
  id?: string
  type: WorkflowNodeType
  status: WorkflowNodeStatus
  input: Record<string, unknown>
  output: Record<string, unknown>
  version: number
  userModified: boolean
  skipReason?: string
  error?: WorkflowError
  startedAt?: string
  completedAt?: string
}

export interface WorkflowResult {
  brief?: CreativeBrief
  briefReview?: BriefReview
  brandConstraint?: BrandConstraintPackage
  creativeDirection?: { directions: CreativeDirection[]; selectedDirectionId: string }
  prompt?: PromptPlan
  generate?: {
    candidates: CandidateImage[]
    evaluations: CandidateEvaluation[]
    selectedCandidateId: string
    durationMs: number
  }
  compositionDraft?: ArtTextCompositionDraft
  compose?:
    | CompositionOutput
    | {
        finalImageUrl: string
        sourceCandidateId: string
        objectKey?: string
        mode: 'skipped'
      }
  finalEvaluation?: FinalEvaluationResult
  finalImageUrl?: string
}

type EventBase = { workflowId: string; timestamp: string }
type NodeEventBase = EventBase & { nodeId: string; nodeType: WorkflowNodeType }

export type WorkflowSseEvent =
  | ({ type: 'workflow_started' } & EventBase)
  | ({ type: 'node_queued' } & NodeEventBase)
  | ({ type: 'node_started' } & NodeEventBase)
  | ({ type: 'node_completed'; output: unknown } & NodeEventBase)
  | ({ type: 'node_skipped'; reason: string } & NodeEventBase)
  | ({
      type: 'node_failed'
      error: WorkflowError & { code: string; message: string; retryable: boolean }
    } & NodeEventBase)
  | ({
      type: 'workflow_awaiting_user'
      action: WorkflowAwaitingAction
      result?: WorkflowResult
    } & EventBase)
  | ({ type: 'workflow_completed'; result: unknown } & EventBase)
  | ({ type: 'workflow_failed'; error: Omit<WorkflowError, 'retryable'> } & EventBase)

export interface CreateWorkflowRequest {
  prompt: string
  spaceId: string
  selectedKnowledgeBaseIds?: string[]
  requirements?: BrandRequirementInput
}

export function normalizeCreativeDirection(
  value: Partial<CreativeDirection> & { id: string },
): CreativeDirection {
  const name = value.name?.trim() || value.title?.trim() || '未命名创意方向'
  const concept = value.concept?.trim() || value.summary?.trim() || '围绕品牌目标建立视觉表达'
  const applicableScenes = value.applicableScenes?.length
    ? value.applicableScenes
    : value.channels?.length
      ? value.channels
      : ['通用品牌传播']
  return {
    id: value.id,
    name,
    concept,
    visualKeywords: value.visualKeywords?.length
      ? value.visualKeywords
      : [value.visualStyle || '品牌视觉'],
    applicableScenes,
    reason: value.reason?.trim() || `适合${applicableScenes.join('、')}的品牌传播目标`,
    risk: value.risk?.trim() || '需在实际生成时继续校验品牌一致性与主体可读性',
    title: value.title?.trim() || name,
    summary: value.summary?.trim() || concept,
    visualStyle: value.visualStyle || '品牌视觉',
    composition: value.composition || '主体清晰并保留视觉安全区',
    colorStrategy: value.colorStrategy || '遵循品牌色并保持足够对比度',
    visualFocus: value.visualFocus || '品牌核心主体',
    mood: value.mood || '清晰、可信',
    copyStyle: value.copyStyle || '简洁、准确',
    channels: value.channels?.length ? value.channels : applicableScenes,
  }
}

export function createInitialWorkflowNodes(): WorkflowNodeSnapshot[] {
  return WORKFLOW_NODE_ORDER.map((type) => ({
    type,
    status: 'pending',
    input: {},
    output: {},
    version: 1,
    userModified: false,
  }))
}

export function downstreamNodeTypes(type: WorkflowNodeType): WorkflowNodeType[] {
  const index = WORKFLOW_NODE_ORDER.indexOf(type)
  return index < 0 ? [] : WORKFLOW_NODE_ORDER.slice(index + 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasWorkflowError(value: unknown, requireRetryable: boolean): boolean {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (!requireRetryable || typeof value.retryable === 'boolean')
  )
}

export function parseWorkflowSseEvent(value: unknown): WorkflowSseEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (typeof value.workflowId !== 'string' || typeof value.timestamp !== 'string') return null

  if (value.type === 'workflow_started') return value as unknown as WorkflowSseEvent
  if (value.type === 'workflow_awaiting_user') {
    const actions: readonly WorkflowAwaitingAction[] = [
      'confirm_brief',
      'select_direction',
      'select_candidate',
      'enter_art_text',
      'select_art_text',
      'select_art_text_region',
    ]
    return typeof value.action === 'string' &&
      actions.includes(value.action as WorkflowAwaitingAction)
      ? (value as unknown as WorkflowSseEvent)
      : null
  }
  if (value.type === 'workflow_completed') {
    return 'result' in value ? (value as unknown as WorkflowSseEvent) : null
  }
  if (value.type === 'workflow_failed') {
    return hasWorkflowError(value.error, false) ? (value as unknown as WorkflowSseEvent) : null
  }

  const nodeType =
    typeof value.nodeType === 'string' ? normalizeWorkflowNodeType(value.nodeType) : undefined
  if (!nodeType || typeof value.nodeId !== 'string') return null
  const normalized = { ...value, nodeType }
  if (value.type === 'node_queued' || value.type === 'node_started') {
    return normalized as unknown as WorkflowSseEvent
  }
  if (value.type === 'node_completed') {
    return 'output' in value ? (normalized as unknown as WorkflowSseEvent) : null
  }
  if (value.type === 'node_skipped') {
    return typeof value.reason === 'string' ? (normalized as unknown as WorkflowSseEvent) : null
  }
  if (value.type === 'node_failed') {
    return hasWorkflowError(value.error, true) ? (normalized as unknown as WorkflowSseEvent) : null
  }
  return null
}

export function isNormalizedArtTextRegion(value: ArtTextRegion): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 1 &&
    value.y + value.height <= 1
  )
}

export function sortCandidateEvaluations(
  evaluations: CandidateEvaluation[],
): CandidateEvaluation[] {
  return [...evaluations].sort(
    (left, right) =>
      right.totalScore - left.totalScore || left.candidateId.localeCompare(right.candidateId),
  )
}
