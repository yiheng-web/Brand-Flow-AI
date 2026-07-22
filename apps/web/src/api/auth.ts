/**
 * 认证 API（登录 / 注册）
 *
 * 接口：
 * - login: 邮箱密码登录
 * - register: 新用户注册
 */

import apiClient from './index'

// ============================================================
// 类型定义
// ============================================================

/** 登录请求参数 */
export interface LoginParams {
  email: string // 企业邮箱
  password: string // 登录密码
}

/** 注册请求参数 */
export interface RegisterParams {
  name: string // 用户姓名
  email: string // 企业邮箱
  password: string // 登录密码
  confirmPassword: string // 确认密码（用于前端校验）
}

/** 认证成功返回的数据结构 */
export interface AuthResult {
  token: string // JWT token，后续请求携带用于身份验证
  user: {
    id: string
    name: string // 用户显示名称
    email: string // 用户邮箱
  }
}

// ============================================================
// 后端响应结构（仅用于适配转换）
// ============================================================

interface BackendLoginData {
  access_token: string
  user: {
    id: string
    email: string
    profile: {
      nickname?: string
      avatar?: string
    }
    currentEnterpriseId?: string
  }
}

/** 将后端登录数据转换为前端 AuthResult 格式 */
function toAuthResult(backend: BackendLoginData): AuthResult {
  return {
    token: backend.access_token,
    user: {
      id: backend.user.id,
      name: backend.user.profile?.nickname || backend.user.email.split('@')[0],
      email: backend.user.email,
    },
  }
}

// ============================================================
// 真实后端 API 调用
// ============================================================

/**
 * 调用后端登录接口
 *
 * 注意：
 * - 后端 TransformInterceptor 将响应包装为 { success, data, message }
 *   其中 data = { access_token, user }
 * - axios 响应拦截器已执行 response.data
 * - 所以 apiClient.post 返回的是 { success: true, data: BackendLoginData, message: "success" }
 * - 需要取 res.data 获取 BackendLoginData
 */
async function realLogin(params: LoginParams) {
  const res = (await apiClient.post('/auth/login', params)) as unknown as BackendLoginData
  return {
    success: true,
    data: toAuthResult(res),
  }
}

/** 仅注册，成功后返回成功标识（不自动登录） */
async function realRegister(params: RegisterParams) {
  await apiClient.post('/auth/register', {
    email: params.email,
    password: params.password,
    nickname: params.name,
  })
  return { success: true }
}

// ============================================================
// 导出 API 函数
// ============================================================

/** 邮箱密码登录 */
export async function login(params: LoginParams) {
  return realLogin(params)
}

/** 新用户注册 */
export async function register(params: RegisterParams) {
  return realRegister(params)
}
