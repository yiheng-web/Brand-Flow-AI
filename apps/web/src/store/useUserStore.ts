import { create } from 'zustand'

export type UserRole = 'personal' | 'member' | 'admin'

interface UserState {
  id: string
  name: string
  email: string
  currentSpaceId: string
  role: UserRole
  setCurrentSpaceId: (spaceId: string) => void
  setRole: (role: UserRole) => void
}

export const useUserStore = create<UserState>((set) => ({
  id: 'demo-user',
  name: '王同学',
  email: 'wang@hdu.edu.cn',
  currentSpaceId: 'personal',
  role: 'personal',
  setCurrentSpaceId: (currentSpaceId) => set({ currentSpaceId }),
  setRole: (role) => set({ role }),
}))
