import { apiClient, unwrapResponse } from './client'
import type { DashboardSummary } from '../types/admin'

export async function fetchDashboard() {
  const response = await apiClient.get<DashboardSummary>('/admin/dashboard')
  return unwrapResponse<DashboardSummary>(response.data)
}
