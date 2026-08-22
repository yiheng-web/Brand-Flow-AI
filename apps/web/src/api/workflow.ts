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
  BrandRequirementInput,
  CreativeBrief,
  OptimizationFeedback,
  PromptPlan,
} from '@brand-flow/contracts'

import apiClient from './index'

export type StreamEvent = WorkflowSseEvent

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
  requirements?: BrandRequirementInput
  needsComposition?: boolean
}

export interface WorkflowDetailResponse {
  workflow: WorkflowData
  nodes: WorkflowNodeSnapshot[]
}

export async function submitPrompt(params: SubmitPromptParams): Promise<WorkflowData> {
  return apiClient.post<unknown, WorkflowData>('/workflow/create', params)
}

export async function startWorkflow(
  workflowId: string,
  needsComposition: boolean,
): Promise<WorkflowData> {
  return apiClient.post<unknown, WorkflowData>(`/workflow/${workflowId}/start`, {
    needsComposition,
  })
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

export const confirmBrief = (workflowId: string) =>
  apiClient.post(`/workflow/${workflowId}/brief/confirm`)

export const updateBrief = (workflowId: string, brief: CreativeBrief) =>
  apiClient.put(`/workflow/${workflowId}/brief`, brief)

export const regenerateBrief = (workflowId: string) =>
  apiClient.post(`/workflow/${workflowId}/brief/regenerate`)

export const optimizeWorkflow = (
  workflowId: string,
  feedback: Omit<OptimizationFeedback, 'preserveBrandPositioning' | 'preserveCoreSubject'>,
): Promise<{ revisionId: string; round: number; revisedPrompt: PromptPlan }> =>
  apiClient.post(`/workflow/${workflowId}/optimize`, feedback)

export const getWorkflowRevisions = (workflowId: string) =>
  apiClient.get(`/workflow/${workflowId}/revisions`)

export const getResultDownload = (
  workflowId: string,
): Promise<{ fileName: string; downloadUrl: string }> =>
  apiClient.post(`/workflow/${workflowId}/result/download`)

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
