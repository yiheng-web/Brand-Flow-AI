/**
 * 用户 / 企业 / 空间全局状态 Store
 *
 * 管理：
 * - 当前选中的空间（个人 / 团队 / 企业）
 * - 可访问的空间列表
 * - 切换空间的 action
 */

import { create } from 'zustand'
import type { EnterpriseData, TeamData } from '@/api/org'

/** 空间类型 */
export type SpaceType = 'personal' | 'team' | 'enterprise'

/** 统一空间项（用于选择器展示） */
export interface SpaceItem {
  id: string
  name: string
  type: SpaceType
  description: string
  /** 关联的 enterpriseId（团队和企业需要） */
  enterpriseId?: string
}

interface UserState {
  // ---- 企业相关（保留兼容）----
  currentEnterpriseId: string | null
  enterprises: EnterpriseData[]
  setCurrentEnterpriseId: (enterpriseId: string) => void
  setEnterprises: (enterprises: EnterpriseData[]) => void

  // ---- 团队相关 ----
  currentTeamId: string | null
  teams: TeamData[]
  setCurrentTeamId: (teamId: string | null) => void
  setTeams: (teams: TeamData[]) => void

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

export const useUserStore = create<UserState>((set) => ({
  // ---- 企业状态 ----
  currentEnterpriseId: null,
  enterprises: [],
  setCurrentEnterpriseId: (enterpriseId) => set({ currentEnterpriseId: enterpriseId }),
  setEnterprises: (enterprises) => {
    set({ enterprises })
    if (enterprises.length > 0) {
      set((state) => ({
        currentEnterpriseId: state.currentEnterpriseId || enterprises[0].enterpriseId,
      }))
    }
  },

  // ---- 团队状态 ----
  currentTeamId: null,
  teams: [],
  setCurrentTeamId: (teamId) => set({ currentTeamId: teamId }),
  setTeams: (teams) => {
    set({ teams })
    if (teams.length > 0) {
      set((state) => ({
        currentTeamId: state.currentTeamId || teams[0]._id,
      }))
    }
  },

  // ---- 空间状态 ----
  currentSpaceId: null,
  currentSpaceName: '个人空间',
  currentSpaceType: 'personal',
  spaces: [],
  setSpaces: (spaces) => {
    set({ spaces })
    // 自动选中第一个空间（如果还没有）
    if (spaces.length > 0) {
      set((state) => ({
        currentSpaceId: state.currentSpaceId || spaces[0].id,
        currentSpaceName: state.currentSpaceId ? state.currentSpaceName : spaces[0].name,
        currentSpaceType: state.currentSpaceId ? state.currentSpaceType : spaces[0].type,
      }))
    }
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
