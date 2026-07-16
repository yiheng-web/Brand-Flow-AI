/**
 * 路由鉴权守卫
 *
 * 包裹需要登录才能访问的路由。
 * - 未登录 → 重定向到 /login
 * - 已登录 → 正常渲染子路由（<Outlet />）
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'

const AuthGuard = () => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const token = useAuthStore((state) => state.token)

  if (!isLoggedIn || !token) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default AuthGuard
