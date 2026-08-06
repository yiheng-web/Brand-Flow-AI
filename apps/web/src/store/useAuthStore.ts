/**
 * 认证状态 Store
 *
 * 管理：
 * - 登录/注册状态
 * - 用户信息 + token
 * - setAuth / logout 两个 action
 *
 * 使用 zustand/middleware persist 将 token 与用户信息持久化到 localStorage，
 * 页面刷新后登录状态不丢失。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthResult } from '@/api/auth'

/** 用户基本信息 */
interface AuthUser {
  id?: string // 用户 ID
  name: string // 用户显示名称
  email: string // 用户邮箱
  role?: string // 当前角色（owner / admin / member）
}

/** Store 状态与 action 类型定义 */
interface AuthState {
  isLoggedIn: boolean // 是否已登录
  user: AuthUser | null // 当前登录用户信息（null = 未登录）
  token: string | null // JWT token，用于后续 API 鉴权
  // login: (email: string) => void // 简单登录（旧方式，仅设用户）
  setAuth: (result: AuthResult) => void // 完整设置认证信息（注册/登录后调用）
  logout: () => void // 退出登录，清空所有认证状态
}

// export const useAuthStore = create<AuthState>((set) => ({
//   isLoggedIn: false,
//   user: null,
//   token: null,

//   /** 简单登录：仅根据邮箱设置用户（早期简化版，保留兼容） */
//   login: (email) =>
//     set({
//       isLoggedIn: true,
//       user: { name: '王同学', email },
//       token: 'mock_token',
//     }),

//   /** 完整设置认证信息：从 API 返回结果写入 token + 用户数据 */
//   setAuth: (result) =>
//     set({
//       isLoggedIn: true,
//       user: result.user,
//       token: result.token,
//     }),

//   /** 退出登录：清空所有状态 */
//   logout: () =>
//     set({
//       isLoggedIn: false,
//       user: null,
//       token: null,
//     }),
// }))

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      user: null,
      token: null,

      setAuth: (result) =>
        set({
          isLoggedIn: true,
          user: result.user,
          token: result.token,
        }),

      logout: () =>
        set({
          isLoggedIn: false,
          user: null,
          token: null,
        }),
    }),
    {
      name: 'brand-flow-auth',
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        user: state.user,
        token: state.token,
      }),
    },
  ),
)
