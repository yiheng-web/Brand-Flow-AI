import { apiClient, unwrapResponse } from './client'
import type { ListQuery, PageResult, ReviewItem } from '../types/admin'

export async function fetchReviewQueue(query: ListQuery) {
  const response = await apiClient.get<PageResult<ReviewItem>>('/admin/review-queue', {
    params: query,
  })
  return unwrapResponse<PageResult<ReviewItem>>(response.data)
}

export async function approveReviewItem(itemId: string) {
  const response = await apiClient.post<{ success: boolean }>(
    `/admin/review-queue/${itemId}/approve`,
  )
  return unwrapResponse<{ success: boolean }>(response.data)
}

export async function rejectReviewItem(itemId: string, reason: string) {
  const response = await apiClient.post<{ success: boolean }>(
    `/admin/review-queue/${itemId}/reject`,
    { reason },
  )
  return unwrapResponse<{ success: boolean }>(response.data)
}
