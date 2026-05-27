import { create } from 'zustand'

interface AuthUser {
  id: string
  name: string
  email: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: 'demo-token',
  user: {
    id: 'demo-user',
    name: '王同学',
    email: 'wang@hdu.edu.cn',
  },
  login: (token, user) => set({ token, user }),
  logout: () => set({ token: null, user: null }),
}))
