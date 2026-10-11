import apiClient from './index'
import type { CreateTaskRequest, TaskData, TaskPage, TaskStatus } from '@brand-flow/contracts'
import type { AuditLogData } from './org'
import type { SubmissionData, TaskDeliverable } from '@brand-flow/contracts'
export const getSubmissions = (task: TaskData): Promise<SubmissionData[]> =>
  apiClient.get(`/tasks/${task.id}/submissions`, { params: { teamId: task.teamId } })
export const getDeliverables = (task: TaskData): Promise<TaskDeliverable[]> =>
  apiClient.get(`/tasks/${task.id}/deliverables`, { params: { teamId: task.teamId } })
export const submitTask = (
  task: TaskData,
  deliverable: TaskDeliverable,
  comment: string,
): Promise<TaskData> =>
  apiClient.post(`/tasks/${task.id}/submit`, {
    teamId: task.teamId,
    version: task.version,
    workId: deliverable.workId,
    workVersionId: deliverable.workVersionId,
    comment,
  })
export const reviewTask = (
  task: TaskData,
  submissionId: string,
  decision: 'approve' | 'reject',
  reason: string,
): Promise<TaskData> =>
  apiClient.post(`/tasks/${task.id}/review`, {
    teamId: task.teamId,
    version: task.version,
    submissionId,
    decision,
    reason,
  })
export const resumeTask = (task: TaskData): Promise<TaskData> =>
  apiClient.post(`/tasks/${task.id}/resume`, { teamId: task.teamId, version: task.version })

export const createTask = (body: CreateTaskRequest): Promise<TaskData> =>
  apiClient.post('/tasks', body)
export const listTasks = (query: {
  teamId: string
  view?: string
  status?: TaskStatus
  deadline?: string
  page?: number
}): Promise<TaskPage> => apiClient.get('/tasks', { params: query })
export const getTask = (id: string, teamId: string): Promise<TaskData> =>
  apiClient.get(`/tasks/${id}`, { params: { teamId } })
export const startTask = (task: TaskData): Promise<TaskData> =>
  apiClient.post(`/tasks/${task.id}/start`, { teamId: task.teamId, version: task.version })
export const getTaskTimeline = (id: string, teamId: string): Promise<AuditLogData[]> =>
  apiClient.get(`/tasks/${id}/timeline`, { params: { teamId } })
export const taskCommand = (
  task: TaskData,
  action: 'assign' | 'accept' | 'decline' | 'cancel',
  extra: { assigneeId?: string; reason?: string } = {},
): Promise<TaskData> =>
  apiClient.post(`/tasks/${task.id}/${action}`, {
    teamId: task.teamId,
    version: task.version,
    ...extra,
  })
