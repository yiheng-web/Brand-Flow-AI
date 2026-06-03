/**
 * 用户 / 企业全局状态 Store
 *
 * 管理：
 * - 当前选中的企业 ID，供全平台共享
 * - 我的企业列表缓存
 * - 切换企业的 action
 */

import { create } from 'zustand'
import type { EnterpriseData } from '@/api/org'

interface UserState {
  /** 当前选中的企业 ID */
  currentEnterpriseId: string | null
  /** 我的企业列表（从 /org/enterprises 获取） */
  enterprises: EnterpriseData[]
  /** 切换到指定企业 */
  setCurrentEnterpriseId: (enterpriseId: string) => void
  /** 设置企业列表 */
  setEnterprises: (enterprises: EnterpriseData[]) => void
}

export const useUserStore = create<UserState>((set) => ({
  currentEnterpriseId: null,
  enterprises: [],
  setCurrentEnterpriseId: (enterpriseId) => set({ currentEnterpriseId: enterpriseId }),
  setEnterprises: (enterprises) => {
    set({ enterprises })
    // 自动选中第一个企业（如果还没有当前企业）
    if (enterprises.length > 0) {
      set((state) => ({
        currentEnterpriseId: state.currentEnterpriseId || enterprises[0].enterpriseId,
      }))
    }
  },
}))
