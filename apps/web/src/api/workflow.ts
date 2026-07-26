/**
 * 工作流 / 创意提交 API
 *
 * 接口：
 * - submitPrompt: 提交创意描述，创建 AI 创作工作流
 * - getWorkflowDetail: 获取工作流完整详情及快照
 */

import apiClient from './index'

// ============================================================
// 类型定义（与后端 workflow.controller.ts / workflow.processor.ts 对齐）
// ============================================================

/** 提交创意请求参数 */
export interface SubmitPromptParams {
  prompt: string
  spaceId: string
  /** @deprecated 使用 selectedKnowledgeBaseIds 替代 */
  knowledgeId?: string
  /** 空间类型（首页选择） */
  spaceType?: 'personal' | 'team' | 'enterprise'
  /** 选中的知识库 ID 列表（最多 3 个） */
  selectedKnowledgeBaseIds?: string[]
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
  type:
    | 'connected'
    | 'workflow_completed'
    | 'workflow_failed'
    | 'node_completed'
    | 'node_skipped'
    | 'node_started'
    | 'node_progress'
    | 'node_failed'
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

export interface WorkflowNodeSnapshot {
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stale'
  output?: Record<string, unknown>
}

export interface WorkflowDetailResponse {
  workflow: WorkflowData
  nodes: WorkflowNodeSnapshot[]
}

/**
 * 获取工作流完整详情（包含节点快照）
 */
export async function getWorkflowDetail(workflowId: string): Promise<WorkflowDetailResponse> {
  return apiClient.get<any, WorkflowDetailResponse>(`/workflow/${workflowId}`)
}

/**
 * 手动更新某个节点的输出产物（如用户手动编辑提示词）
 * 这会将当前节点更新，并级联使下游节点失效 (stale)
 */
export async function updateNodeOutput(
  workflowId: string,
  nodeType: string,
  payload: Record<string, unknown>,
): Promise<any> {
  return apiClient.put(`/workflow/${workflowId}/nodes/${nodeType}`, payload)
}

/**
 * 触发特定节点重新运行（断点续传）
 */
export async function rerunNode(
  workflowId: string,
  nodeType: string,
): Promise<{ success: boolean; message: string }> {
  return apiClient.post(`/workflow/${workflowId}/nodes/${nodeType}/run`)
}
