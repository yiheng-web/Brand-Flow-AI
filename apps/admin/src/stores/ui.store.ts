import { create } from 'zustand'

interface UiState {
  collapsed: boolean
  theme: 'light' | 'dark'
  setCollapsed: (collapsed: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
}

export const useUiStore = create<UiState>((set) => ({
  collapsed: false,
  theme: 'light',
  setCollapsed: (collapsed) => set({ collapsed }),
  setTheme: (theme) => set({ theme }),
}))
