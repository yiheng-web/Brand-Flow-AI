import type {
  CreateWorkflowRequest,
  RerunWorkflowRequest,
  WorkflowDto,
  WorkflowStreamEvent,
} from '@brand-flow/common'

import { useAuthStore } from '@/store/useAuthStore'

import { apiClient, getApiBaseUrl } from './client'
import { normalizeStreamEvents } from './workflowStream'

export function submitPrompt(params: CreateWorkflowRequest) {
  return apiClient.post<WorkflowDto>('/workflow/create', params)
}

export function getWorkflowStatus(id: string) {
  return apiClient.get<WorkflowDto>(`/workflow/${id}/status`)
}

export function rerunWorkflow(id: string, params: RerunWorkflowRequest) {
  return apiClient.post<WorkflowDto>(`/workflow/${id}/rerun`, params)
}

interface WorkflowStreamHandlers {
  onEvent?: (event: WorkflowStreamEvent) => void
  onError?: (error: Event, reason?: string) => void
  onClose?: () => void
}

export function streamWorkflow(id: string, handlers: WorkflowStreamHandlers) {
  const url = new URL(`/api/workflow/${id}/stream`, getApiBaseUrl().replace(/\/api$/, ''))
  const token = useAuthStore.getState().token
  if (token) {
    url.searchParams.set('token', token)
  }

  const source = new EventSource(url.toString())
  let completed = false

  source.onmessage = (event) => {
    try {
      const raw = JSON.parse(event.data) as WorkflowStreamEvent
      const events = normalizeStreamEvents(raw)
      for (const normalized of events) {
        if (normalized.type === 'completed' || normalized.type === 'workflow_completed') {
          completed = true
        }
        handlers.onEvent?.(normalized)
      }
    } catch {
      handlers.onEvent?.({ type: 'progress', data: event.data })
    }
  }

  source.onerror = (error) => {
    const reason = completed
      ? undefined
      : '流式连接失败，可能是登录状态过期、SSE 鉴权失败或后端服务未启动。'
    handlers.onError?.(error, reason)
    source.close()
    handlers.onClose?.()
  }

  return () => {
    source.close()
    handlers.onClose?.()
  }
}
