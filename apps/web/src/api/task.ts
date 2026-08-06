/**
 * 任务空间 API
 *
 * ⚠️ 后端待实现接口清单：
 * - GET    /tasks                          → 获取任务列表（支持状态筛选）
 * - POST   /tasks                          → 创建任务
 * - GET    /tasks/:id                      → 获取任务详情
 * - PUT    /tasks/:id                      → 更新任务
 * - DELETE /tasks/:id                      → 删除任务
 * - POST   /tasks/:id/claim                → 认领任务（企业→团队：原子锁定）
 * - POST   /tasks/:id/accept              → 成员接收任务（团队→成员）
 * - POST   /tasks/:id/submit               → 提交作品
 * - POST   /tasks/:id/approve              → 审核通过
 * - POST   /tasks/:id/reject               → 审核拒绝（必须填写意见）
 * - POST   /tasks/:id/cancel               → 取消任务
 * - GET    /tasks/:id/timeline             → 获取任务时间线
 * - POST   /tasks/:id/timeline             → 添加时间线记录
 * - GET    /teams/:id/members              → 获取团队成员（用于指派）
 *
 * 后端 Schema 需实现：
 * - Task: title, content, status, priority, type, publisherId,
 *   receiverId, receiverType, assigneeId, deadline, attachments,
 *   createdAt, updatedAt, completedAt
 * - Timeline: taskId, userId, action, content, metadata, createdAt
 *
 * 任务状态流转：
 * 草稿 → 待接收 → 进行中 → 待审核 → 待修改 → 已完成
 *                                              ↘ 已取消
 *                                              ↘ 组织异常
 */

import apiClient from './index'

// ============================
// 类型定义
// ============================

/** 任务状态 */
export type TaskStatus =
  | 'draft' // 草稿
  | 'pending' // 待接收
  | 'in_progress' // 进行中
  | 'review' // 待审核
  | 'revision' // 待修改
  | 'completed' // 已完成
  | 'cancelled' // 已取消
  | 'org_error' // 组织异常

/** 任务类型 */
export type TaskType =
  | 'enterprise_to_team' // 企业→团队：企业管理员发布，团队管理员认领
  | 'team_to_member' // 团队→成员：团队管理员发布，指定成员执行

/** 优先级 */
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

/** 接收方类型 */
export type ReceiverType = 'team' | 'member'

/** 时间线动作类型 */
export type TimelineAction =
  | 'created' // 创建任务
  | 'claimed' // 被认领
  | 'accepted' // 被接收
  | 'submitted' // 提交作品
  | 'approved' // 审核通过
  | 'rejected' // 审核拒绝
  | 'resubmitted' // 重新提交
  | 'cancelled' // 取消任务
  | 'org_error' // 组织异常
  | 'commented' // 评论

/** 任务附件 */
export interface TaskAttachment {
  id: string
  name: string
  url: string
  size?: number
  mimeType?: string
}

/** 时间线条目 */
export interface TimelineEntry {
  id: string
  taskId: string
  userId: string
  userNickname: string
  action: TimelineAction
  content?: string
  metadata?: {
    attachments?: TaskAttachment[]
    rejectReason?: string
  }
  createdAt: string
}

/** 任务数据 */
export interface TaskData {
  _id: string
  title: string
  content: string
  status: TaskStatus
  type: TaskType
  priority: Priority
  publisherId: string
  publisherName: string
  receiverId: string
  receiverName: string
  receiverType: ReceiverType
  assigneeId?: string
  assigneeName?: string
  deadline?: string
  attachments: TaskAttachment[]
  createdAt: string
  updatedAt: string
  completedAt?: string
  timeline?: TimelineEntry[]
}

/** 创建任务参数 */
export interface CreateTaskParams {
  title: string
  content: string
  receiverId: string
  receiverType: ReceiverType
  type: TaskType
  priority?: Priority
  deadline?: string
  attachments?: TaskAttachment[]
  assigneeId?: string
}

/** 更新任务参数 */
export interface UpdateTaskParams {
  title?: string
  content?: string
  priority?: Priority
  deadline?: string
  attachments?: TaskAttachment[]
}

/** 提交作品参数 */
export interface SubmitTaskParams {
  attachments: TaskAttachment[]
  comment?: string
}

/** 审核参数 */
export interface ReviewTaskParams {
  rejectReason?: string
}

/** 任务列表筛选 */
export interface TaskListParams {
  status?: TaskStatus
  type?: TaskType
  page?: number
  limit?: number
}

// ============================
// 状态映射
// ============================

export const STATUS_MAP: Record<TaskStatus, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'default' },
  pending: { text: '待接收', color: 'orange' },
  in_progress: { text: '进行中', color: 'processing' },
  review: { text: '待审核', color: 'blue' },
  revision: { text: '待修改', color: 'purple' },
  completed: { text: '已完成', color: 'success' },
  cancelled: { text: '已取消', color: 'default' },
  org_error: { text: '组织异常', color: 'error' },
}

export const PRIORITY_MAP: Record<Priority, { text: string; color: string }> = {
  low: { text: '低', color: 'default' },
  medium: { text: '中', color: 'blue' },
  high: { text: '高', color: 'orange' },
  urgent: { text: '紧急', color: 'red' },
}

export const ACTION_MAP: Record<TimelineAction, string> = {
  created: '发布了任务',
  claimed: '认领了任务',
  accepted: '接收了任务',
  submitted: '提交了作品',
  approved: '审核通过',
  rejected: '审核拒绝',
  resubmitted: '重新提交了作品',
  cancelled: '取消了任务',
  org_error: '组织异常',
  commented: '发表了评论',
}

// ============================
// API 函数
// ============================

/** 获取任务列表（支持状态筛选） */
export async function getTasks(params?: TaskListParams) {
  return apiClient.get('/tasks', { params })
}

/** 获取任务详情 */
export async function getTaskDetail(taskId: string) {
  return apiClient.get(`/tasks/${taskId}`)
}

/** 创建任务 */
export async function createTask(params: CreateTaskParams) {
  return apiClient.post('/tasks', params)
}

/** 更新任务 */
export async function updateTask(taskId: string, params: UpdateTaskParams) {
  return apiClient.put(`/tasks/${taskId}`, params)
}

/** 删除任务 */
export async function deleteTask(taskId: string) {
  return apiClient.delete(`/tasks/${taskId}`)
}

/** 认领任务（企业→团队：原子锁定） */
export async function claimTask(taskId: string) {
  return apiClient.post(`/tasks/${taskId}/claim`)
}

/** 成员接收任务（团队→成员） */
export async function acceptTask(taskId: string) {
  return apiClient.post(`/tasks/${taskId}/accept`)
}

/** 提交作品 */
export async function submitTask(taskId: string, params: SubmitTaskParams) {
  return apiClient.post(`/tasks/${taskId}/submit`, params)
}

/** 审核通过 */
export async function approveTask(taskId: string) {
  return apiClient.post(`/tasks/${taskId}/approve`)
}

/** 审核拒绝（必须填写意见） */
export async function rejectTask(taskId: string, params: ReviewTaskParams) {
  return apiClient.post(`/tasks/${taskId}/reject`, params)
}

/** 取消任务 */
export async function cancelTask(taskId: string) {
  return apiClient.post(`/tasks/${taskId}/cancel`)
}

/** 获取任务时间线 */
export async function getTaskTimeline(taskId: string) {
  return apiClient.get(`/tasks/${taskId}/timeline`)
}

/** 添加时间线记录（评论） */
export async function addTimelineEntry(taskId: string, content: string) {
  return apiClient.post(`/tasks/${taskId}/timeline`, { content })
}
