import type { ReactNode } from 'react'
import { useAuthStore } from '../stores/auth.store'

interface PermissionGateProps {
  permission: string
  children: ReactNode
}

export function PermissionGate({ permission, children }: PermissionGateProps) {
  const permissions = useAuthStore((state) => state.permissions)

  if (!permissions.includes('*') && !permissions.includes(permission)) {
    return null
  }

  return children
}
