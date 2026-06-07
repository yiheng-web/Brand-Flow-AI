export type PlatformRole = 'super_admin' | 'ops_admin' | 'support' | 'auditor'

export interface AdminUser {
  userId: string
  email: string
  name?: string
  platformRole: PlatformRole
  permissions: string[]
}

export interface PageResult<T> {
  items: T[]
  total: number
}

export interface DashboardSummary {
  users: number
  enterprises: number
  teams: number
  generationsToday: number
  quotaUsed: number
  pendingReviews: number
}

export interface ManagedUser {
  id: string
  email: string
  nickname: string
  status: 'active' | 'disabled'
  role: string
  createdAt: string
}

export interface ManagedEnterprise {
  id: string
  name: string
  status: 'active' | 'disabled'
  members: number
  teams: number
  quotaUsed: number
  createdAt: string
}

export interface ReviewItem {
  id: string
  title: string
  type: 'knowledge' | 'asset'
  enterpriseName: string
  submitter: string
  status: 'pending_review' | 'active' | 'rejected'
  createdAt: string
}

export interface AuditLog {
  id: string
  actor: string
  action: string
  targetType: string
  targetName: string
  createdAt: string
}
