import { apiClient } from './client'

export interface LoginParams {
  email: string
  password: string
}

export interface RegisterParams {
  name: string
  email: string
  password: string
}

export interface AuthResult {
  token: string
  user: {
    id: string
    name: string
    email: string
  }
}

export function login(params: LoginParams) {
  return apiClient.post<AuthResult>('/auth/login', params)
}

export function register(params: RegisterParams) {
  return apiClient.post<AuthResult>('/auth/register', params)
}
