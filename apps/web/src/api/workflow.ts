import type {
  CreateWorkflowRequest,
  RerunWorkflowRequest,
  WorkflowDto,
  WorkflowStreamEvent,
} from '@brand-flow/common'

import { apiClient, getApiBaseUrl } from './client'

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
  onError?: (error: Event) => void
  onClose?: () => void
}

export function streamWorkflow(id: string, handlers: WorkflowStreamHandlers) {
  const url = new URL(`/api/workflow/${id}/stream`, getApiBaseUrl().replace(/\/api$/, ''))
  const source = new EventSource(url.toString())

  source.onmessage = (event) => {
    try {
      handlers.onEvent?.(JSON.parse(event.data) as WorkflowStreamEvent)
    } catch {
      handlers.onEvent?.({ type: 'progress', data: event.data })
    }
  }

  source.onerror = (error) => {
    handlers.onError?.(error)
    source.close()
    handlers.onClose?.()
  }

  return () => {
    source.close()
    handlers.onClose?.()
  }
}
