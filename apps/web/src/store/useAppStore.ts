import { create } from 'zustand'

import type { KnowledgeScope } from '@brand-flow/common'

export type ChatMode = KnowledgeScope

interface AppState {
  navExpanded: boolean
  hasTeam: boolean
  chatMode: ChatMode
  currentAssetTab: KnowledgeScope
  inviteCode?: string
  setNavExpanded: (expanded: boolean) => void
  setHasTeam: (hasTeam: boolean) => void
  setChatMode: (mode: ChatMode) => void
  setCurrentAssetTab: (tab: KnowledgeScope) => void
  setInviteCode: (code?: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  navExpanded: false,
  hasTeam: false,
  chatMode: 'personal',
  currentAssetTab: 'personal',
  setNavExpanded: (navExpanded) => set({ navExpanded }),
  setHasTeam: (hasTeam) =>
    set((state) => ({
      hasTeam,
      chatMode: hasTeam ? state.chatMode : 'personal',
      currentAssetTab: hasTeam ? state.currentAssetTab : 'personal',
    })),
  setChatMode: (chatMode) => set({ chatMode }),
  setCurrentAssetTab: (currentAssetTab) => set({ currentAssetTab }),
  setInviteCode: (inviteCode) => set({ inviteCode }),
}))
