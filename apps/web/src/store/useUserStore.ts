import type { SpacePermissions, SpaceType } from '@brand-flow/contracts'
export type { SpaceType } from '@brand-flow/contracts'
/**
 * 用户 / 企业 / 空间全局状态 Store
 *
 * 管理：
 * - 当前选中的空间（个人 / 团队 / 企业）
 * - 可访问的空间列表
 * - 切换空间的 action
 */

import { create } from 'zustand'
import { getMyEnterprises, getMySpaces, type EnterpriseData, type SpaceData } from '@/api/org'

/** 空间类型 */

/** 统一空间项（用于选择器展示） */
export interface SpaceItem {
  permissions?: SpacePermissions
  id: string
  name: string
  type: SpaceType
  description: string
  /** 关联的 enterpriseId（团队和企业需要） */
  enterpriseId?: string
}

export function normalizeSpaces(spaces: SpaceData[]): SpaceItem[] {
  return spaces.map((space) => ({
    id: space.spaceId,
    name: space.name,
    type: space.type,
    enterpriseId: space.enterpriseId,
    permissions: space.permissions,
    description:
      space.description || (space.type === 'personal' ? '作品和知识归你所有' : '组织协作空间'),
  }))
}

interface UserState {
  refreshOrganizations: () => Promise<void>
  // ---- 企业相关（保留兼容）----
  currentEnterpriseId: string | null
  enterprises: EnterpriseData[]
  setCurrentEnterpriseId: (enterpriseId: string | null) => void
  setEnterprises: (enterprises: EnterpriseData[]) => void

  // ---- 空间相关（新增）----
  /** 当前选中的空间 ID */
  currentSpaceId: string | null
  /** 当前空间名称（用于顶部栏显示） */
  currentSpaceName: string
  /** 当前空间类型 */
  currentSpaceType: SpaceType
  /** 可访问的空间列表 */
  spaces: SpaceItem[]
  /** 设置空间列表 */
  setSpaces: (spaces: SpaceItem[]) => void
  /** 切换当前空间 */
  setCurrentSpace: (spaceId: string) => void
}

export const useUserStore = create<UserState>((set, get) => ({
  refreshOrganizations: async () => {
    const [enterprises, spaces] = await Promise.all([getMyEnterprises(), getMySpaces()])
    get().setEnterprises(enterprises)
    get().setSpaces(normalizeSpaces(spaces))
  },
  // ---- 企业状态 ----
  currentEnterpriseId: null,
  enterprises: [],
  setCurrentEnterpriseId: (enterpriseId) => set({ currentEnterpriseId: enterpriseId }),
  setEnterprises: (enterprises) => {
    set((state) => ({
      enterprises,
      currentEnterpriseId: enterprises.some(
        (item) => item.enterpriseId === state.currentEnterpriseId,
      )
        ? state.currentEnterpriseId
        : (enterprises[0]?.enterpriseId ?? null),
    }))
  },

  // ---- 空间状态 ----
  currentSpaceId: null,
  currentSpaceName: '个人空间',
  currentSpaceType: 'personal',
  spaces: [],
  setSpaces: (spaces) => {
    set((state) => {
      const space =
        spaces.find((item) => item.id === state.currentSpaceId) ??
        spaces.find((item) => item.type === 'personal') ??
        spaces[0]
      return {
        spaces,
        currentSpaceId: space?.id ?? null,
        currentSpaceName: space?.name ?? '个人空间',
        currentSpaceType: space?.type ?? 'personal',
      }
    })
  },
  setCurrentSpace: (spaceId) => {
    set((state) => {
      const space = state.spaces.find((s) => s.id === spaceId)
      if (!space) return {}
      return {
        currentSpaceId: space.id,
        currentSpaceName: space.name,
        currentSpaceType: space.type,
        // 如果是企业或团队类型，同步更新企业 ID
        ...(space.enterpriseId ? { currentEnterpriseId: space.enterpriseId } : {}),
      }
    })
  },
}))
