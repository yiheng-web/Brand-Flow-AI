import { Role } from './authorization'
import type { CreateWorkflowRequest } from './index'

export const TASK_STATUSES = [
  'draft',
  'pending',
  'accepted',
  'in_progress',
  'submitted',
  'reviewing',
  'rejected',
  'completed',
  'cancelled',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type AssignmentType = 'single_assignee'
export type SubmissionStatus = 'submitted' | 'reviewing' | 'approved' | 'rejected'
export type TaskAction =
  | 'assign'
  | 'accept'
  | 'decline'
  | 'cancel'
  | 'start'
  | 'submit'
  | 'review'
  | 'resume'
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['accepted', 'draft', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['reviewing'],
  reviewing: ['completed', 'rejected'],
  rejected: ['in_progress', 'submitted', 'cancelled'],
  completed: [],
  cancelled: [],
}
export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) === true
}
export interface TaskPermission {
  manage: boolean
  execute: boolean
  review: boolean
}
export function taskPermissions(role: Role, userId: string, assigneeId?: string): TaskPermission {
  const manage = role === Role.OWNER || role === Role.ADMIN
  return { manage, review: manage, execute: role !== Role.VIEWER && userId === assigneeId }
}
export interface TaskRequirement extends Omit<
  CreateWorkflowRequest,
  'spaceId' | 'generationConfig'
> {
  generationConfig?: {
    width?: number
    height?: number
    seed?: number
    aspectRatio?: import('./index').ImageAspectRatio
  }
  needsComposition: boolean
  channel?: string
}
export interface TaskData {
  id: string
  enterpriseId: string
  teamId: string
  creatorId: string
  assigneeId?: string
  title: string
  description: string
  priority: TaskPriority
  deadline?: string
  status: TaskStatus
  version: number
  requirementSnapshot: TaskRequirement
  activeWorkflowId?: string
  latestSubmissionId?: string
  progress?: {
    status: import('./index').WorkflowStatus
    currentNode?: import('./index').WorkflowNodeType
    awaitingAction?: import('./index').WorkflowAwaitingAction
    percent: number
    updatedAt: string
    executionError?: string
  }
  declineReason?: string
  permissions: TaskPermission
  overdue: boolean
  createdAt: string
  updatedAt: string
}
export interface CreateTaskRequest {
  teamId: string
  title: string
  description?: string
  priority?: TaskPriority
  deadline?: string
  requirementSnapshot: TaskRequirement
}
export interface TaskPage {
  items: TaskData[]
  total: number
  page: number
  pageSize: number
}
