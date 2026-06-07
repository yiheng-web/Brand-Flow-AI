import { apiClient, unwrapResponse } from './client'
import type { AdminUser } from '../types/admin'

interface LoginResponse {
  token: string
  adminUser: AdminUser
}

export async function loginAdmin(email: string, password: string) {
  const response = await apiClient.post<LoginResponse>('/admin/login', { email, password })
  return unwrapResponse<LoginResponse>(response.data)
}

export async function fetchAdminMe() {
  const response = await apiClient.get<AdminUser>('/admin/me')
  return unwrapResponse<AdminUser>(response.data)
}
