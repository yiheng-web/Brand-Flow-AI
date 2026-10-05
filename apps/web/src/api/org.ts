// 组织 / 企业 / 团队 / 空间管理
import apiClient from './index'

import type {
  RoleValue as Role,
  SpaceType,
  SpacePermissions,
  CreateInvitationResult,
  InvitationData,
  EnterpriseStatus,
  TeamStatus,
} from '@brand-flow/contracts'
export type { RoleValue as Role, SpaceType } from '@brand-flow/contracts'

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
  status: EnterpriseStatus
  role: Role
  permissions: SpacePermissions
}

// 切换企业结果
export interface SwitchEnterpriseResult {
  success: boolean
  currentEnterpriseId: string
  access_token: string
}

// 创建团队请求参数
export interface CreateTeamParams {
  enterpriseId?: string
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
  status: TeamStatus
  role: Role
  permissions: SpacePermissions
}

// 空间数据（后端 GET /org/spaces 返回）
export interface SpaceData {
  role: Role
  permissions: SpacePermissions
  spaceId: string
  name: string
  type: SpaceType
  enterpriseId?: string
  teamId?: string
  description?: string
}

export interface SpaceMemberData {
  userId: string
  email: string
  nickname?: string
  avatar?: string
  role: Role
}

export interface InviteSpaceMemberParams {
  email: string
  role?: Role
}

// 创建企业
export async function createEnterprise(params: CreateEnterpriseParams) {
  return apiClient.post('/org/enterprise', params)
}

// 获取我的企业列表
export async function getMyEnterprises(): Promise<EnterpriseData[]> {
  return apiClient.get('/org/enterprises')
}

// 切换当前企业
export async function switchEnterprise(enterpriseId: string): Promise<SwitchEnterpriseResult> {
  return apiClient.put(`/org/enterprise/${enterpriseId}/switch`)
}

// 获取当前用户可访问的空间列表
export async function getMySpaces(): Promise<SpaceData[]> {
  return apiClient.get('/org/spaces')
}

export async function getSpaceMembers(spaceId: string): Promise<SpaceMemberData[]> {
  return apiClient.get(`/org/spaces/${spaceId}/members`)
}

export async function inviteSpaceMember(
  spaceId: string,
  params: InviteSpaceMemberParams,
): Promise<CreateInvitationResult> {
  return apiClient.post(`/org/spaces/${spaceId}/invitations`, params)
}

// 创建团队
export async function createTeam(params: CreateTeamParams) {
  return apiClient.post('/org/team', params)
}

// 获取当前企业下的团队列表
export async function getTeams(enterpriseId?: string): Promise<TeamData[]> {
  return apiClient.get('/org/teams', { params: { enterpriseId } })
}

export function updateEnterprise(
  id: string,
  params: Partial<CreateEnterpriseParams> & { status?: 'active' | 'disabled' },
) {
  return apiClient.put(`/org/enterprise/${id}`, params)
}

export function updateTeam(
  id: string,
  params: Partial<Omit<CreateTeamParams, 'enterpriseId'>> & { status?: 'active' | 'archived' },
) {
  return apiClient.put(`/org/team/${id}`, params)
}

export function deleteTeam(id: string) {
  return apiClient.delete(`/org/team/${id}`)
}

export function changeMemberRole(spaceId: string, userId: string, role: Role) {
  return apiClient.put(`/org/spaces/${spaceId}/members/${userId}`, { role })
}

export function removeMember(spaceId: string, userId: string) {
  return apiClient.delete(`/org/spaces/${spaceId}/members/${userId}`)
}

export function leaveSpace(spaceId: string) {
  return apiClient.post(`/org/spaces/${spaceId}/leave`)
}

export function transferOwner(enterpriseId: string, targetUserId: string) {
  return apiClient.put(`/org/enterprise/${enterpriseId}/owner`, { targetUserId })
}

export function getInvitations(direction: 'received' | 'sent'): Promise<InvitationData[]> {
  return apiClient.get('/org/invitations', { params: { direction } })
}

export function respondInvitation(
  id: string,
  action: 'accept' | 'reject' | 'cancel',
): Promise<InvitationData> {
  return apiClient.post(`/org/invitations/${id}/${action}`, {})
}
