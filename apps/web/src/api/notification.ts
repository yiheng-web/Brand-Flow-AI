/**
 * 消息通知 API
 *
 * ⚠️ 后端待实现接口清单：
 * - GET    /notifications                          → 获取通知列表（支持筛选）
 * - POST   /notifications/read-all                  → 全部标为已读
 * - POST   /notifications/:id/read                 → 单条标为已读
 * - DELETE /notifications/:id                      → 删除通知
 * - GET    /notifications/unread-count             → 获取未读数量
 *
 * 后端 Schema 需实现：
 * - Notification: type, title, summary, senderId, senderName,
 *   orgId, orgName, isRead, relatedType, relatedId,
 *   actionUrl, createdAt, expired (资源失效标记)
 *
 * 通知类型枚举：
 * - team_invite      团队邀请
 * - team_join        团队加入
 * - team_leave       退出申请
 * - enterprise_invite 企业邀请
 * - enterprise_join  企业加入
 * - task_created     新任务
 * - task_review      任务审核
 * - task_submit      任务提交
 * - review_result    审核结果
 * - work_deleted     作品删除
 * - ai_completed     AI 任务完成
 * - permission_change 权限变化
 * - system           系统通知
 */

import apiClient from './index'

// ============================
// 类型定义
// ============================

/** 通知类型 */
export type NotificationType =
  | 'team_invite'
  | 'team_join'
  | 'team_leave'
  | 'enterprise_invite'
  | 'enterprise_join'
  | 'task_created'
  | 'task_review'
  | 'task_submit'
  | 'review_result'
  | 'work_deleted'
  | 'ai_completed'
  | 'permission_change'
  | 'system'

/** 关联资源类型 */
export type RelatedType = 'task' | 'work' | 'team' | 'enterprise' | 'approval' | 'workspace'

/** 通知数据 */
export interface NotificationData {
  _id: string
  type: NotificationType
  title: string
  summary: string
  senderId?: string
  senderName: string
  senderAvatar?: string
  orgId?: string
  orgName?: string
  isRead: boolean
  relatedType?: RelatedType
  relatedId?: string
  actionUrl?: string
  expired?: boolean
  expiredReason?: string
  createdAt: string
}

/** 通知列表筛选 */
export interface NotificationListParams {
  isRead?: boolean
  type?: NotificationType
  page?: number
  limit?: number
}

// ============================
// 类型映射
// ============================

export const TYPE_MAP: Record<NotificationType, { text: string; color: string; icon: string }> = {
  team_invite: { text: '团队邀请', color: 'blue', icon: 'team' },
  team_join: { text: '团队加入', color: 'blue', icon: 'team' },
  team_leave: { text: '退出申请', color: 'orange', icon: 'team' },
  enterprise_invite: { text: '企业邀请', color: 'purple', icon: 'enterprise' },
  enterprise_join: { text: '企业加入', color: 'purple', icon: 'enterprise' },
  task_created: { text: '新任务', color: 'blue', icon: 'task' },
  task_review: { text: '任务审核', color: 'gold', icon: 'task' },
  task_submit: { text: '任务提交', color: 'cyan', icon: 'task' },
  review_result: { text: '审核结果', color: 'green', icon: 'review' },
  work_deleted: { text: '作品删除', color: 'red', icon: 'work' },
  ai_completed: { text: 'AI 完成', color: 'processing', icon: 'ai' },
  permission_change: { text: '权限变化', color: 'default', icon: 'lock' },
  system: { text: '系统通知', color: 'default', icon: 'system' },
}

export const TYPE_FILTER_OPTIONS: Array<{ value: NotificationType | ''; label: string }> = [
  { value: '', label: '全部类型' },
  { value: 'team_invite', label: '团队邀请' },
  { value: 'team_join', label: '团队加入' },
  { value: 'team_leave', label: '退出申请' },
  { value: 'enterprise_invite', label: '企业邀请' },
  { value: 'task_created', label: '新任务' },
  { value: 'task_review', label: '任务审核' },
  { value: 'task_submit', label: '任务提交' },
  { value: 'review_result', label: '审核结果' },
  { value: 'work_deleted', label: '作品删除' },
  { value: 'ai_completed', label: 'AI 完成' },
  { value: 'permission_change', label: '权限变化' },
  { value: 'system', label: '系统通知' },
]

// ============================
// API 函数
// ============================

/** 获取通知列表 */
export async function getNotifications(params?: NotificationListParams) {
  return apiClient.get('/notifications', { params })
}

/** 获取未读数量 */
export async function getUnreadCount() {
  return apiClient.get('/notifications/unread-count')
}

/** 单条标为已读 */
export async function markNotificationRead(notificationId: string) {
  return apiClient.post(`/notifications/${notificationId}/read`)
}

/** 全部标为已读 */
export async function markAllNotificationsRead() {
  return apiClient.post('/notifications/read-all')
}

/** 删除通知 */
export async function deleteNotification(notificationId: string) {
  return apiClient.delete(`/notifications/${notificationId}`)
}
