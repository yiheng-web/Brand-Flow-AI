import type { FinalEvaluationResult } from '@brand-flow/contracts'
import apiClient from './index'

export interface WorkVersionData {
  _id: string
  versionNo: number
  imageUrl: string
  createdAt?: string
}
export interface WorkData {
  _id: string
  title: string
  spaceId: string
  finalImageUrl: string
  workflowId?: string
  qualityReport?: FinalEvaluationResult
  nodesSnapshot?: Record<string, unknown>
  createdAt?: string
  versions?: WorkVersionData[]
  isFavorite?: boolean
}
export interface CreateWorkParams {
  title: string
  spaceId: string
  finalImageUrl: string
  workflowId: string
  objectKey?: string
  qualityReport?: FinalEvaluationResult
  nodesSnapshot: Record<string, unknown>
  metadata?: Record<string, unknown>
}
export const createWork = (params: CreateWorkParams): Promise<WorkData> =>
  apiClient.post('/works', params)
export const getWorks = (spaceId: string): Promise<WorkData[]> =>
  apiClient.get('/works', { params: { spaceId } })
export const getWork = (id: string): Promise<WorkData> => apiClient.get(`/works/${id}`)
export const deleteWork = (id: string): Promise<{ success: true }> =>
  apiClient.delete(`/works/${id}`)
export const exportWork = (id: string): Promise<{ fileName: string; downloadUrl: string }> =>
  apiClient.post(`/works/${id}/export`, { format: 'png' })
export const createTrustedWorkVersion = (
  id: string,
  workflowId: string,
): Promise<WorkVersionData> => apiClient.post(`/works/${id}/versions/from-workflow`, { workflowId })
export const updateWorkFavorite = (
  id: string,
  isFavorite: boolean,
): Promise<{ id: string; isFavorite: boolean }> =>
  apiClient.post(`/works/${id}/favorite`, { isFavorite })
