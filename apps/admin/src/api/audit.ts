import { apiClient, unwrapResponse } from './client'
import type { AuditLog, ListQuery, PageResult } from '../types/admin'

export async function fetchAuditLogs(query: ListQuery) {
  const response = await apiClient.get<PageResult<AuditLog>>('/admin/audit-logs', { params: query })
  return unwrapResponse<PageResult<AuditLog>>(response.data)
}
