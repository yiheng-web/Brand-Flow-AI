import type {
  CreateKnowledgeRequest,
  KnowledgeItem,
  KnowledgeOverviewDto,
  KnowledgeScope,
  ListKnowledgeQuery,
  SetKnowledgeEnabledRequest,
  UpdateKnowledgeRequest,
} from '@brand-flow/common'

import { apiClient } from './client'

export function getKnowledgeOverview(scope: KnowledgeScope) {
  return apiClient.get<KnowledgeOverviewDto>('/knowledge/overview', { params: { scope } })
}

export function createKnowledgeBase(scope: KnowledgeScope, name: string) {
  return apiClient.post<KnowledgeOverviewDto>('/knowledge/base', { scope, name })
}

export function listKnowledge(params: ListKnowledgeQuery) {
  return apiClient.get<KnowledgeItem[]>('/knowledge', { params })
}

export function getKnowledge(id: string) {
  return apiClient.get<KnowledgeItem>(`/knowledge/${id}`)
}

export function createKnowledge(data: CreateKnowledgeRequest) {
  return apiClient.post<KnowledgeItem>('/knowledge', data)
}

export function updateKnowledge(id: string, data: UpdateKnowledgeRequest) {
  return apiClient.patch<KnowledgeItem>(`/knowledge/${id}`, data)
}

export function deleteKnowledge(id: string) {
  return apiClient.delete<{ success: boolean }>(`/knowledge/${id}`)
}

export function setKnowledgeEnabled(id: string, data: SetKnowledgeEnabledRequest) {
  return apiClient.patch<KnowledgeItem>(`/knowledge/${id}/enabled`, data)
}
