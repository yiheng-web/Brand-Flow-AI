/**
 * 作品空间 API
 *
 * ⚠️ 后端待实现接口清单：
 * - GET    /works                          → 获取作品列表（支持状态筛选 + 搜索）
 * - POST   /works                          → 创建作品（首页节点确认后调用）
 * - GET    /works/:id                      → 获取作品详情
 * - DELETE /works/:id                      → 删除作品（仅本人可删）
 * - POST   /works/:id/archive              → 归档作品
 * - POST   /works/:id/restore              → 恢复归档作品
 * - GET    /works/:id/versions             → 获取历史版本列表
 * - GET    /works/:id/versions/:versionId  → 获取指定版本
 * - POST   /works/:id/versions             → 创建新版本（保存中间结果）
 * - POST   /works/:id/share                → 提交到创作空间
 * - POST   /works/:id/retry                → 重试失败作品
 * - POST   /works/:id/download             → 获取下载链接
 *
 * 后端 Schema 需实现：
 * - Work: title, status, source, spaceType, knowledgeBases, rules,
 *   selectedConcept, finalPrompt, layoutConfig, candidateImages,
 *   qualityReport, versions, isArchived, archiveExpiresAt,
 *   createdBy, createdAt, updatedAt
 * - WorkVersion: workId, version, title, imageUrl, createdAt
 * - CandidateImage: id, imageUrl, score, dimensions, reasoning
 */

import apiClient from './index'

// ============================
// 类型定义
// ============================

/** 作品状态 */
export type WorkStatus =
  | 'not_started' // 未启动
  | 'in_progress' // 创作中
  | 'awaiting_review' // 等待用户确认
  | 'failed' // 生成失败
  | 'completed' // 已完成
  | 'archived' // 已归档

/** 空间类型 */
export type SpaceType = 'personal' | 'team' | 'enterprise'

/** 候选图 */
export interface CandidateImage {
  id: string
  imageUrl: string
  score: number
  dimensions?: string
  reasoning?: string
  isRetry?: boolean
}

/** 历史版本 */
export interface WorkVersion {
  id: string
  workId: string
  version: number
  title: string
  imageUrl: string
  createdAt: string
}

/** 质检维度 */
export interface QualityDimension {
  name: string
  score: number
  comment?: string
}

/** 质检报告 */
export interface QualityReport {
  overallScore: number
  dimensions: QualityDimension[]
}

/** 排版配置 */
export interface LayoutConfig {
  texts: Array<{
    id: string
    content: string
    position?: { x: number; y: number }
    fontSize?: number
  }>
}

/** 作品数据 */
export interface WorkData {
  _id: string
  title: string
  status: WorkStatus
  source: string // 原始需求
  spaceType: SpaceType
  spaceName?: string
  knowledgeBases: Array<{ id: string; name: string }>
  rules: Array<{ id: string; name: string; version?: string }>
  selectedConcept?: string // 所选创意方案
  finalPrompt?: string
  layoutConfig?: LayoutConfig
  finalImageUrl?: string
  candidateImages: CandidateImage[]
  qualityReport?: QualityReport
  versions: WorkVersion[]
  isArchived: boolean
  archiveExpiresAt?: string
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

/** 创建作品参数 */
export interface CreateWorkParams {
  title: string
  source: string
  spaceType: SpaceType
  spaceId?: string
  knowledgeBaseIds?: string[]
  ruleIds?: string[]
}

/** 作品列表筛选 */
export interface WorkListParams {
  status?: WorkStatus
  keyword?: string
  page?: number
  limit?: number
}

// ============================
// 状态映射
// ============================

export const WORK_STATUS_MAP: Record<WorkStatus, { text: string; color: string }> = {
  not_started: { text: '未启动', color: 'default' },
  in_progress: { text: '创作中', color: 'processing' },
  awaiting_review: { text: '等待确认', color: 'gold' },
  failed: { text: '生成失败', color: 'error' },
  completed: { text: '已完成', color: 'success' },
  archived: { text: '已归档', color: 'default' },
}

export const SPACE_TYPE_MAP: Record<SpaceType, string> = {
  personal: '个人空间',
  team: '团队空间',
  enterprise: '企业空间',
}

// ============================
// API 函数
// ============================

/** 获取作品列表 */
export async function getWorks(params?: WorkListParams) {
  return apiClient.get('/works', { params })
}

/** 获取作品详情 */
export async function getWorkDetail(workId: string) {
  return apiClient.get(`/works/${workId}`)
}

/** 删除作品 */
export async function deleteWork(workId: string) {
  return apiClient.delete(`/works/${workId}`)
}

/** 归档作品 */
export async function archiveWork(workId: string) {
  return apiClient.post(`/works/${workId}/archive`)
}

/** 恢复归档作品 */
export async function restoreWork(workId: string) {
  return apiClient.post(`/works/${workId}/restore`)
}

/** 获取历史版本列表 */
export async function getWorkVersions(workId: string) {
  return apiClient.get(`/works/${workId}/versions`)
}

/** 获取指定版本 */
export async function getWorkVersion(workId: string, versionId: string) {
  return apiClient.get(`/works/${workId}/versions/${versionId}`)
}

/** 创建新版本 */
export async function createWorkVersion(workId: string, data: Partial<WorkVersion>) {
  return apiClient.post(`/works/${workId}/versions`, data)
}

/** 提交到创作空间 */
export async function shareWork(workId: string) {
  return apiClient.post(`/works/${workId}/share`)
}

/** 重试失败作品 */
export async function retryWork(workId: string) {
  return apiClient.post(`/works/${workId}/retry`)
}

/** 获取下载链接 */
export async function downloadWork(workId: string) {
  return apiClient.post(`/works/${workId}/download`)
}
