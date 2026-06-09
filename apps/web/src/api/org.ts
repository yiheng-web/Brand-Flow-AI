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
