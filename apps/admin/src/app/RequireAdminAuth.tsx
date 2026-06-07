import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'

interface RequireAdminAuthProps {
  children: ReactNode
}

export function RequireAdminAuth({ children }: RequireAdminAuthProps) {
  const token = useAuthStore((state) => state.token)
  const adminUser = useAuthStore((state) => state.adminUser)
  const loadMe = useAuthStore((state) => state.loadMe)
  const location = useLocation()

  useEffect(() => {
    if (token && !adminUser) {
      void loadMe()
    }
  }, [adminUser, loadMe, token])

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
