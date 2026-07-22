//资产管理
import apiClient from './index'
export type OwnerType = 'user' | 'team' | 'enterprise'
export type Visibility = 'private' | 'team' | 'enterprise' | 'public'

//创建资产请求参数
export interface CreateAssetParams {
  name: string
  type: string
  url: string
  ownerId: string
  ownerType: OwnerType
  visibility: Visibility
  metadata?: Record<string, unknown>
}

// 资产数据
export interface AssetData {
  _id: string
  name: string
  type: string
  url: string
  ownerId: string
  ownerType: OwnerType
  visibility: Visibility
  creatorId?:
    | string
    | {
        _id: string
        email: string
        profile?: Record<string, unknown>
      }
  enterpriseId?: string
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}
export async function createAsset(params: CreateAssetParams) {
  return apiClient.post('/assets', params)
}

export async function getAssets(spaceId?: string): Promise<AssetData[]> {
  return apiClient.get('/assets', { params: { spaceId } })
}

export async function uploadAsset(params: {
  file: File
  name: string
  type: string
  ownerId: string
  ownerType: OwnerType
  visibility: Visibility
  tags?: string
  description?: string
}): Promise<AssetData & { signedUrl?: string }> {
  const form = new FormData()
  form.append('file', params.file)
  form.append('name', params.name)
  form.append('type', params.type)
  form.append('ownerId', params.ownerId)
  form.append('ownerType', params.ownerType)
  form.append('visibility', params.visibility)
  if (params.tags) form.append('tags', params.tags)
  if (params.description) form.append('description', params.description)
  return apiClient.post('/assets/upload', form)
}

export async function saveAssetToKnowledge(
  assetId: string,
  knowledgeId: string,
): Promise<{ success: boolean }> {
  return apiClient.post(`/assets/${assetId}/save-to-knowledge`, { knowledgeId })
}

export async function deleteAsset(assetId: string) {
  return apiClient.delete(`/assets/${assetId}`)
}
