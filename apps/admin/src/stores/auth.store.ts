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

const demoAdmin: AdminUser = {
  userId: 'admin_demo',
  email: 'admin@brand-flow.ai',
  name: '平台运营管理员',
  platformRole: 'super_admin',
  permissions: ['*'],
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: '',
      permissions: [],
      async login(email, password) {
        if (email === 'demo@brand-flow.ai' && password === 'demo123456') {
          set({
            token: 'demo-admin-token',
            adminUser: demoAdmin,
            permissions: demoAdmin.permissions,
          })
          return
        }

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
        if (get().token === 'demo-admin-token') {
          set({ adminUser: demoAdmin, permissions: demoAdmin.permissions })
          return
        }

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
