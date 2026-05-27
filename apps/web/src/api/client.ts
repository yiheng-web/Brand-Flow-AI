import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { message } from 'antd'

import type { ApiResponse } from '@brand-flow/common'

import { useAuthStore } from '@/store/useAuthStore'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

const axiosClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

axiosClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

axiosClient.interceptors.response.use(
  (response) => response.data,
  (error: unknown) => {
    if (axios.isAxiosError<ApiResponse>(error)) {
      const errorMessage = error.response?.data?.message ?? error.message
      message.error(errorMessage)

      if (error.response?.status === 401 && window.location.pathname !== '/login') {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    } else {
      message.error('网络异常，请稍后重试')
    }

    return Promise.reject(error)
  },
)

interface ApiClient {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>>
}

export const apiClient = axiosClient as unknown as ApiClient

export function getApiBaseUrl() {
  return baseURL
}
