import { create } from 'zustand'

interface AuthUser {
  name: string
  email: string
}

interface AuthState {
  isLoggedIn: boolean
  user: AuthUser | null
  login: (email: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  user: null,
  login: (email) =>
    set({
      isLoggedIn: true,
      user: {
        name: '王同学',
        email,
      },
    }),
  logout: () =>
    set({
      isLoggedIn: false,
      user: null,
    }),
}))