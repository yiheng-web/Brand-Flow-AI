import axios from 'axios'
import { message } from 'antd'
import { useAuthStore } from '@/store/useAuthStore'

interface ApiResponse {
  message?: string
  [key: string]: unknown
}

const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ----- 请求拦截器 -----
// 自动注入 token（从 auth store 中读取）
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ----- 响应拦截器 -----
// 统一处理错误（401 跳登录、网络异常提示等）
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const backendData = error.response?.data as ApiResponse | undefined
    const errorMessage = backendData?.message || error.message || '网络异常，请稍后重试'
    message.error(errorMessage)

    if (error.response?.status === 401) {
      // token 过期，清除持久化登录状态后跳转到登录页
      useAuthStore.getState().logout()
      // 如果已经在登录页则不跳转（登录失败也是 401，跳转会刷新页面导致错误提示消失）
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  },
)

export default apiClient
