import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchAdminMe, loginAdmin } from '../api/auth'
import type { AdminUser } from '../types/admin'

interface AuthState {
  token: string
  adminUser?: AdminUser
  permissions: string[]
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: '',
      permissions: [],
      async login(email, password) {
        const result = await loginAdmin(email, password)
        set({
          token: result.token,
          adminUser: result.adminUser,
          permissions: result.adminUser.permissions,
        })
      },
      logout() {
        set({ token: '', adminUser: undefined, permissions: [] })
      },
      async loadMe() {
        const adminUser = await fetchAdminMe()
        set({ adminUser, permissions: adminUser.permissions })
      },
    }),
    {
      name: 'brand-flow-admin-auth',
      partialize: (state) => ({
        token: state.token,
        adminUser: state.adminUser,
        permissions: state.permissions,
      }),
    },
  ),
)
