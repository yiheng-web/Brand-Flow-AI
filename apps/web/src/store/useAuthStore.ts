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
  id: string
  name: string // 用户显示名称
  email: string // 用户邮箱
}

/** Store 状态与 action 类型定义 */
interface AuthState {
  isLoggedIn: boolean // 是否已登录
  user: AuthUser | null // 当前登录用户信息（null = 未登录）
  token: string | null // JWT token，用于后续 API 鉴权
  setAuth: (result: AuthResult) => void // 完整设置认证信息（注册/登录后调用）
  setToken: (token: string) => void
  logout: () => void // 退出登录，清空所有认证状态
}

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

      setToken: (token) => set({ token, isLoggedIn: true }),

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
