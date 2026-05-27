import type { KnowledgeOverviewDto, KnowledgeScope } from '@brand-flow/common'

import { apiClient } from './client'

export function getKnowledgeOverview(scope: KnowledgeScope) {
  return apiClient.get<KnowledgeOverviewDto>('/knowledge', { params: { scope } })
}

export function createKnowledgeBase(scope: KnowledgeScope, name: string) {
  return apiClient.post<KnowledgeOverviewDto>('/knowledge', { scope, name })
}
