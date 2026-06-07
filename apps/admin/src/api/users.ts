import { apiClient, unwrapResponse } from './client'
import type { ListQuery, ManagedUser, PageResult } from '../types/admin'

export async function fetchUsers(query: ListQuery) {
  const response = await apiClient.get<PageResult<ManagedUser>>('/admin/users', { params: query })
  return unwrapResponse<PageResult<ManagedUser>>(response.data)
}

export async function fetchUser(userId: string) {
  const response = await apiClient.get<ManagedUser>(`/admin/users/${userId}`)
  return unwrapResponse<ManagedUser>(response.data)
}

export async function updateUserStatus(userId: string, status: 'active' | 'disabled') {
  const response = await apiClient.patch<ManagedUser>(`/admin/users/${userId}/status`, { status })
  return unwrapResponse<ManagedUser>(response.data)
}
