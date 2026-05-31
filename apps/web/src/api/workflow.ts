/**
 * 工作流 / 创意提交 API
 *
 * 接口：
 * - submitPrompt: 提交创意描述，创建 AI 创作工作流
 * - getWorkflowStatus: 查询工作流执行状态
 */

import apiClient from './index'

// ============================================================
// 类型定义
// ============================================================

/** 提交创意请求参数 */
export interface SubmitPromptParams {
  prompt: string
  spaceId: string
}

/** 工作流数据 */
export interface WorkflowData {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  prompt: string
  createdAt: string
}

// ============================================================
// 导出 API 函数（页面层统一调用，不关心 mock 还是真实）
// ============================================================

/** 提交创意描述，创建 AI 创作工作流 */
export async function submitPrompt(params: SubmitPromptParams): Promise<WorkflowData> {
  return apiClient.post<any, WorkflowData>('/workflow/create', params)
}

/** 查询工作流执行状态 */
export async function getWorkflowStatus(id: string): Promise<WorkflowData> {
  return apiClient.get<any, WorkflowData>(`/workflow/${id}/status`)
}
