/**
 * 工作流 / 创意提交 API
 *
 * 接口：
 * - submitPrompt: 提交创意描述，创建 AI 创作工作流
 * - createWorkflowStream: 创建 SSE 流式订阅
 */

import apiClient from './index'

// ============================================================
// 类型定义（与后端 workflow.controller.ts / workflow.processor.ts 对齐）
// ============================================================

/** 提交创意请求参数 */
export interface SubmitPromptParams {
  prompt: string
  spaceId: string
  knowledgeId?: string
}

/** 意图解析输出（对应 packages/agent 中的 IntentOutput） */
export interface IntentOutput {
  intent: string
  confidence: number
  reason: string
  suggestedAction: string
}

/** Prompt 专家输出（对应 PromptChainOutput） */
export interface PromptChainOutput {
  systemPrompt: string
  userPrompt: string
  finalPrompt: string
  negativePrompt?: string
  purpose: string
}

/** 生成结果（对应 GenerateResult） */
export interface GenerateResult {
  success: boolean
  content: string
  generateType: 'image' | 'text' | 'brand_material'
  promptUsed: string
  message?: string
}

/** 评估单项结果 */
export interface EvaluationItem {
  score: number
  comment: string
}

/** 评估输出（对应 EvaluationResult） */
export interface EvaluationResult {
  overallScore: number
  intentEvaluation: EvaluationItem
  promptEvaluation: EvaluationItem
  complianceEvaluation: EvaluationItem
  suggestions: string[]
  status: 'success' | 'failed'
}

/** Agent 完整状态（AgentStateType） */
export interface AgentState {
  userQuery: string
  context?: Record<string, any>
  intentResult?: IntentOutput
  knowledgeContext?: string
  promptResult?: PromptChainOutput
  generateResult?: GenerateResult
  evaluationResult?: EvaluationResult
  retryCount?: number
  status: 'running' | 'success' | 'failed'
  error?: string
}

/** 工作流数据 */
export interface WorkflowData {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: AgentState
  errorMessage?: string
}

/** Workflow status 完整响应 */
export interface WorkflowStatusResponse {
  success?: boolean
  data?: WorkflowData
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  prompt: string
  createdAt: string
  updatedAt: string
  result?: AgentState
  errorMessage?: string
}

/** SSE stream 事件类型 */
export interface StreamEvent {
  type: 'connected' | 'workflow_completed' | 'workflow_failed' | 'node_completed' | 'node_skipped' | 'node_started' | 'node_progress' | 'node_failed'
  workflowId?: string
  data?: Record<string, any>
  error?: string
}

// ============================================================
// 导出 API 函数（页面层统一调用）
// ============================================================

/** 提交创意描述，创建 AI 创作工作流 */
export async function submitPrompt(params: SubmitPromptParams): Promise<WorkflowData> {
  return apiClient.post<any, WorkflowData>('/workflow/create', params)
}


/**
 * 创建 SSE 流式订阅
 * 返回 EventSource 实例，调用方通过 onmessage 或 addEventListener 消费
 */
export function createWorkflowStream(
  workflowId: string,
  baseUrl?: string
): EventSource {
  const fallbackBase = 'http://localhost:3000/api'
  const apiBase = baseUrl || import.meta.env.VITE_API_BASE_URL || fallbackBase
  const url = `${apiBase.replace(/\/+$/, '')}/workflow/${workflowId}/stream`
  return new EventSource(url)
}

/**
 * 手动更新某个节点的输出产物（如用户手动编辑提示词）
 * 这会将当前节点更新，并级联使下游节点失效 (stale)
 */
export async function updateNodeOutput(
  workflowId: string,
  nodeType: string,
  payload: Record<string, unknown>
): Promise<any> {
  return apiClient.put(`/workflow/${workflowId}/nodes/${nodeType}`, payload)
}

/**
 * 触发特定节点重新运行（断点续传）
 */
export async function rerunNode(
  workflowId: string,
  nodeType: string
): Promise<{ success: boolean; message: string }> {
  return apiClient.post(`/workflow/${workflowId}/nodes/${nodeType}/run`)
}
