import apiClient from './index'
import type { CreateTaskRequest, TaskData, TaskPage, TaskStatus } from '@brand-flow/contracts'
import type { AuditLogData } from './org'

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
