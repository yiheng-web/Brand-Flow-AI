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

export async function getAssets(): Promise<AssetData[]> {
  return apiClient.get('/assets')
}

export async function deleteAsset(assetId: string) {
  return apiClient.delete(`/assets/${assetId}`)
}
