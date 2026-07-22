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
  | ({ type: 'node_failed'; error: Required<WorkflowError> } & NodeEventBase)
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

export function parseWorkflowSseEvent(value: unknown): WorkflowSseEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (typeof value.workflowId !== 'string' || typeof value.timestamp !== 'string') return null

  const workflowEvents = [
    'workflow_started',
    'workflow_awaiting_user',
    'workflow_completed',
    'workflow_failed',
  ]
  if (workflowEvents.includes(value.type)) return value as unknown as WorkflowSseEvent

  const nodeType =
    typeof value.nodeType === 'string' ? normalizeWorkflowNodeType(value.nodeType) : undefined
  if (!nodeType || typeof value.nodeId !== 'string') return null
  return { ...value, nodeType } as unknown as WorkflowSseEvent
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
