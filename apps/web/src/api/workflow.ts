import type {
  CreateWorkflowRequest,
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
  status: 'pending' | 'running' | 'completed' | 'failed'
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: WorkflowResult
  errorMessage?: string
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
