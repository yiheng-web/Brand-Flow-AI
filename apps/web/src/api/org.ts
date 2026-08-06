/**
 * 组织 / 企业 / 团队 / 空间管理 API
 *
 * ⚠️ 后端待实现接口清单：
 * 以下接口已在前端定义但后端尚未实现，调用时会回退到 mock 数据：
 * - POST   /org/team/:id/leave              → 退出团队
 * - POST   /org/enterprise/:id/leave        → 退出企业
 * - DELETE /org/team/:id                    → 解散团队
 * - DELETE /org/team/:id/members/:userId   → 移除团队成员
 * - PUT    /org/team/:id/members/:userId/role → 设置成员角色
 * - POST   /org/invitations/generate        → 生成邀请码
 * - POST   /org/invitations/use             → 使用邀请码加入
 * - GET    /org/approvals                   → 获取待审批列表
 * - POST   /org/approvals/:id/approve       → 审批通过
 * - POST   /org/approvals/:id/reject        → 审批拒绝
 * - GET    /org/enterprise/:id/teams        → 获取企业下所有团队
 *
 * 后端 Schema 需扩展：
 * - Team: 增加 memberCount, maxMembers 字段
 * - Enterprise: 增加 teamCount, maxTeams 字段
 * - Role 枚举: 需扩展以区分 team_admin / enterprise_admin / enterprise_creator
 */

// 组织 / 企业 / 团队 / 空间管理
import apiClient from './index'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'
export type SpaceType = 'personal' | 'team' | 'enterprise'

// 创建企业请求参数
export interface CreateEnterpriseParams {
  name: string
  logo?: string
}

// 企业数据
export interface EnterpriseData {
  enterpriseId: string
  name: string
  logo?: string
  status: string
  role: Role
}

// 切换企业结果
export interface SwitchEnterpriseResult {
  success: boolean
  currentEnterpriseId: string
}

// 创建团队请求参数
export interface CreateTeamParams {
  name: string
  description?: string
}

// 团队数据
export interface TeamData {
  _id: string
  enterpriseId: string
  name: string
  description?: string
  createdAt?: string
  updatedAt?: string
  memberCount?: number
  maxMembers?: number
}

// 空间数据（后端 GET /org/spaces 返回）
export interface SpaceData {
  spaceId: string
  name: string
  type: SpaceType
  enterpriseId?: string
  teamId?: string
  description?: string
}

// 团队成员
export interface TeamMember {
  userId: string
  nickname?: string
  email: string
  avatar?: string
  role: Role
}

// 审批请求
export type ApprovalType =
  | 'team_leave'
  | 'team_join_enterprise'
  | 'enterprise_leave'
  | 'member_remove'

export interface ApprovalRequest {
  id: string
  type: ApprovalType
  applicantName: string
  applicantId: string
  reason?: string
  createdAt: string
  // 关联数据
  teamId?: string
  teamName?: string
  enterpriseId?: string
  enterpriseName?: string
}

// 邀请码
export interface InvitationCode {
  code: string
  type: 'team' | 'enterprise'
  targetId: string
  targetName: string
  expiresAt: string
}

// 创建企业
export async function createEnterprise(params: CreateEnterpriseParams) {
  return apiClient.post('/org/enterprise', params)
}

// 获取我的企业列表
export async function getMyEnterprises() {
  return apiClient.get('/org/enterprises')
}

// 切换当前企业
export async function switchEnterprise(enterpriseId: string) {
  return apiClient.put(`/org/enterprise/${enterpriseId}/switch`)
}

// 获取当前用户可访问的空间列表
export async function getMySpaces() {
  return apiClient.get('/org/spaces')
}

// 创建团队
export async function createTeam(params: CreateTeamParams) {
  return apiClient.post('/org/team', params)
}

// 获取当前企业下的团队列表
export async function getTeams() {
  return apiClient.get('/org/teams')
}

// 获取团队成员列表
export async function getTeamMembers(teamId: string) {
  return apiClient.get(`/org/spaces/${teamId}/members`)
}

// 获取企业下所有团队（含每个团队的成员数）
export async function getEnterpriseTeams(enterpriseId: string) {
  return apiClient.get(`/org/enterprise/${enterpriseId}/teams`)
}

// 退出团队
export async function leaveTeam(teamId: string) {
  return apiClient.post(`/org/team/${teamId}/leave`)
}

// 退出企业
export async function leaveEnterprise(enterpriseId: string) {
  return apiClient.post(`/org/enterprise/${enterpriseId}/leave`)
}

// 解散团队
export async function dismissTeam(teamId: string) {
  return apiClient.delete(`/org/team/${teamId}`)
}

// 移除团队成员
export async function removeTeamMember(teamId: string, userId: string) {
  return apiClient.delete(`/org/team/${teamId}/members/${userId}`)
}

// 设置团队成员角色（设为管理员/取消管理员）
export async function setTeamMemberRole(teamId: string, userId: string, role: Role) {
  return apiClient.put(`/org/team/${teamId}/members/${userId}/role`, { role })
}

// 生成邀请码
export async function generateInvitationCode(type: 'team' | 'enterprise', targetId: string) {
  return apiClient.post('/org/invitations/generate', { type, targetId })
}

// 使用邀请码加入
export async function useInvitationCode(code: string) {
  return apiClient.post('/org/invitations/use', { code })
}

// 获取待审批列表
export async function getApprovalRequests() {
  return apiClient.get('/org/approvals')
}

// 审批通过
export async function approveRequest(requestId: string) {
  return apiClient.post(`/org/approvals/${requestId}/approve`)
}

// 审批拒绝
export async function rejectRequest(requestId: string) {
  return apiClient.post(`/org/approvals/${requestId}/reject`)
}
