/**
 * 团队 / 空间管理 API
 *
 * 接口：
 * - getSpaces: 获取所有可用空间列表
 * - getTeamMembers: 获取指定空间的团队成员列表
 * - inviteMember: 邀请成员加入空间
 */

import apiClient from './index'

// ============================================================
// 类型定义
// ============================================================

/** 空间数据 */
export interface SpaceData {
  id: string
  name: string
  isCurrent: boolean
}

/** 团队成员数据 */
export interface TeamMemberData {
  id: string
  name: string
  role: string
  roleType: 'admin' | 'member'
  isSelf?: boolean
}

/** 邀请成员请求参数 */
export interface InviteMemberParams {
  email: string
  spaceId: string
  roleType: 'admin' | 'member'
}

// ============================================================
// 导出 API 函数
// ============================================================

/** 获取所有可用空间列表 */
export async function getSpaces() {
  return apiClient.get('/org/spaces')
}

/** 获取指定空间的团队成员列表 */
export async function getTeamMembers(spaceId: string) {
  return apiClient.get(`/org/spaces/${spaceId}/members`)
}

/** 邀请成员加入空间 */
export async function inviteMember(params: InviteMemberParams) {
  const { email, roleType, spaceId } = params
  return apiClient.post(`/org/spaces/${spaceId}/invitations`, { email, roleType })
}
