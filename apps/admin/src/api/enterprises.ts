import { apiClient, unwrapResponse } from './client'
import type {
  ListQuery,
  ManagedEnterprise,
  ManagedTeam,
  ManagedUser,
  PageResult,
} from '../types/admin'

export async function fetchEnterprises(query: ListQuery) {
  const response = await apiClient.get<PageResult<ManagedEnterprise>>('/admin/enterprises', {
    params: query,
  })
  return unwrapResponse<PageResult<ManagedEnterprise>>(response.data)
}

export async function fetchEnterprise(enterpriseId: string) {
  const response = await apiClient.get<ManagedEnterprise>(`/admin/enterprises/${enterpriseId}`)
  return unwrapResponse<ManagedEnterprise>(response.data)
}

export async function updateEnterpriseStatus(enterpriseId: string, status: 'active' | 'disabled') {
  const response = await apiClient.patch<ManagedEnterprise>(
    `/admin/enterprises/${enterpriseId}/status`,
    { status },
  )
  return unwrapResponse<ManagedEnterprise>(response.data)
}

export async function fetchEnterpriseMembers(enterpriseId: string, query: ListQuery) {
  const response = await apiClient.get<PageResult<ManagedUser>>(
    `/admin/enterprises/${enterpriseId}/members`,
    { params: query },
  )
  return unwrapResponse<PageResult<ManagedUser>>(response.data)
}

export async function fetchEnterpriseTeams(enterpriseId: string, query: ListQuery) {
  const response = await apiClient.get<PageResult<ManagedTeam>>(
    `/admin/enterprises/${enterpriseId}/teams`,
    { params: query },
  )
  return unwrapResponse<PageResult<ManagedTeam>>(response.data)
}
