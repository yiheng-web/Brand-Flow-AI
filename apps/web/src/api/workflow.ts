import type {
  CreateWorkflowRequest,
  ArtTextCandidate,
  ArtTextCompositionDraft,
  ArtTextPlacementPlan,
  ArtTextRegion,
  CompositionLayer,
  CompositionOutput,
  FinalEvaluationResult,
  WorkflowAwaitingAction,
  WorkflowStatus,
  WorkflowNodeSnapshot,
  WorkflowResult,
  WorkflowSseEvent,
} from '@brand-flow/contracts'

import apiClient from './index'

export type StreamEvent = WorkflowSseEvent

// 旧面板暂时保留的只读类型；新 Workflow 主链路使用共享 V1 契约。
export interface IntentOutput {
  intent: string
  confidence: number
  reason: string
  suggestedAction: string
}
export interface PromptChainOutput {
  systemPrompt: string
  userPrompt: string
  finalPrompt: string
  negativePrompt?: string
  purpose: string
}
export interface EvaluationResult {
  overallScore: number
  intentEvaluation: { score: number; comment: string }
  promptEvaluation: { score: number; comment: string }
  complianceEvaluation: { score: number; comment: string }
  suggestions: string[]
  status: 'success' | 'failed'
}

export interface SubmitPromptParams extends CreateWorkflowRequest {
  spaceType?: 'personal' | 'team' | 'enterprise'
}

export interface WorkflowData {
  id: string
  status: WorkflowStatus
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: WorkflowResult
  errorMessage?: string
  awaitingAction?: WorkflowAwaitingAction
}

export interface WorkflowDetailResponse {
  workflow: WorkflowData
  nodes: WorkflowNodeSnapshot[]
}

export async function submitPrompt(params: SubmitPromptParams): Promise<WorkflowData> {
  return apiClient.post<unknown, WorkflowData>('/workflow/create', params)
}

export async function getWorkflowDetail(workflowId: string): Promise<WorkflowDetailResponse> {
  return apiClient.get<unknown, WorkflowDetailResponse>(`/workflow/${workflowId}`)
}

export async function updateNodeOutput(
  workflowId: string,
  nodeType: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return apiClient.put(`/workflow/${workflowId}/nodes/${nodeType}`, payload)
}

export async function rerunNode(
  workflowId: string,
  nodeType: string,
): Promise<{ success: boolean; message: string }> {
  return apiClient.post(`/workflow/${workflowId}/nodes/${nodeType}/run`)
}

export async function generateArtTextCandidates(
  workflowId: string,
  input: { baseCandidateId: string; textContent: string; stylePrompt: string },
): Promise<ArtTextCompositionDraft> {
  return apiClient.post(`/workflow/${workflowId}/composition/art-text/candidates`, input)
}

export async function selectArtTextCandidate(
  workflowId: string,
  candidateId: string,
): Promise<ArtTextCompositionDraft> {
  return apiClient.post(`/workflow/${workflowId}/composition/art-text/select`, { candidateId })
}

export async function createPlacementPlan(
  workflowId: string,
  candidateId: string,
  region: ArtTextRegion,
): Promise<ArtTextPlacementPlan> {
  return apiClient.post(`/workflow/${workflowId}/composition/placement-plan`, {
    candidateId,
    region,
  })
}

export async function saveComposition(
  workflowId: string,
  input: {
    file: File
    baseCandidateId: string
    selectedArtTextCandidateId: string
    textContent: string
    stylePrompt: string
    placement: ArtTextPlacementPlan
    layers: CompositionLayer[]
    width: number
    height: number
  },
): Promise<{ composition: CompositionOutput; finalEvaluation: FinalEvaluationResult }> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('baseCandidateId', input.baseCandidateId)
  form.append('selectedArtTextCandidateId', input.selectedArtTextCandidateId)
  form.append('textContent', input.textContent)
  form.append('stylePrompt', input.stylePrompt)
  form.append('placement', JSON.stringify(input.placement))
  form.append('layers', JSON.stringify(input.layers))
  form.append('width', String(input.width))
  form.append('height', String(input.height))
  form.append('format', 'png')
  return apiClient.put(`/workflow/${workflowId}/composition`, form)
}

export type { ArtTextCandidate }
