// 知识库 API
import apiClient from './index'

// 创建知识库请求参数
export interface CreateKnowledgeParams {
  spaceId: string
  name: string
  description?: string
  isRequired?: boolean
}

// 更新知识库请求参数
export interface UpdateKnowledgeParams {
  name?: string
  description?: string
}

// 导入文本请求参数
export interface IngestKnowledgeParams {
  content: string
}

// 知识库数据
export interface KnowledgeData {
  _id: string
  id?: string
  name: string
  description?: string
  spaceId: string
  spaceType: 'personal' | 'team' | 'enterprise'
  enterpriseId?: string
  isRequired: boolean
  createdAt?: string
  updatedAt?: string
}

export interface KnowledgeItemData {
  _id: string
  knowledgeId: string
  title: string
  content: string
  tags: string[]
  sourceType: 'manual' | 'asset'
  status: 'active' | 'archived'
  constraintLevel?: 'required' | 'recommended' | 'optional'
  metadata?: Record<string, unknown>
}

export interface CreateKnowledgeItemParams {
  title: string
  content: string
  tags?: string[]
  constraintLevel?: 'required' | 'recommended' | 'optional'
  metadata?: Record<string, unknown>
}

export interface KnowledgeBaseOption {
  id: string
  name: string
}

// 知识记录数据
export interface KnowledgeRecordData {
  id: string
  knowledgeId: string
  content: string
  createdAt?: string
  updatedAt?: string
}

// 创建知识库
export async function createKnowledge(params: CreateKnowledgeParams): Promise<KnowledgeData> {
  return apiClient.post<unknown, KnowledgeData>('/knowledge', params)
}

// 获取知识库列表
export async function getKnowledgeList(spaceId = 'personal'): Promise<KnowledgeData[]> {
  return apiClient.get<unknown, KnowledgeData[]>('/knowledge', { params: { spaceId } })
}

// 获取单个知识库
export async function getKnowledgeById(id: string): Promise<KnowledgeData> {
  return apiClient.get<unknown, KnowledgeData>(`/knowledge/${id}`)
}

// 更新知识库
export async function updateKnowledge(id: string, params: UpdateKnowledgeParams) {
  return apiClient.put(`/knowledge/${id}`, params)
}

// 导入文本到知识库
export async function ingestKnowledge(
  id: string,
  params: IngestKnowledgeParams,
): Promise<{ chunks: number; message: string }> {
  return apiClient.post(`/knowledge/${id}/ingest`, params)
}

// 获取知识库记录
export async function getKnowledgeRecords(id: string) {
  return apiClient.get(`/knowledge/${id}/records`)
}

// 删除知识库
export async function deleteKnowledge(id: string) {
  return apiClient.delete(`/knowledge/${id}`)
}

export async function getKnowledgeItems(id: string): Promise<KnowledgeItemData[]> {
  return apiClient.get<unknown, KnowledgeItemData[]>(`/knowledge/${id}/items`)
}

export async function createKnowledgeItem(
  id: string,
  params: CreateKnowledgeItemParams,
): Promise<{ item: KnowledgeItemData; ingest: { chunks: number; message: string } }> {
  return apiClient.post(`/knowledge/${id}/items`, params)
}

export async function deleteKnowledgeItem(
  id: string,
  itemId: string,
): Promise<{ success: boolean }> {
  return apiClient.delete(`/knowledge/${id}/items/${itemId}`)
}

/** 兼容旧弹窗的知识库选择器，返回值保持旧组件约定。 */
export async function getKnowledgeBases(spaceId = 'personal'): Promise<{
  success: true
  data: KnowledgeBaseOption[]
}> {
  const list = await getKnowledgeList(spaceId)
  return {
    success: true,
    data: list.map((item) => ({ id: item._id || item.id || '', name: item.name })),
  }
}

/** 兼容旧弹窗：将用户填写的素材说明保存为结构化知识项。 */
export async function saveToKnowledgeBase(params: {
  materialName: string
  tags: string[]
  targetKbId: string
}): Promise<{ success: true }> {
  await createKnowledgeItem(params.targetKbId, {
    title: params.materialName,
    content: params.materialName,
    tags: params.tags,
    metadata: { source: 'generated-material' },
  })
  return { success: true }
}
