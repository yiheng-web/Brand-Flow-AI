import type { ManagedUser } from '../types/admin'

export const usersFixture: ManagedUser[] = [
  {
    id: 'u_1001',
    email: 'creator@example.com',
    nickname: '个人创作者',
    status: 'active',
    role: 'member',
    createdAt: '2026-06-01',
  },
  {
    id: 'u_1002',
    email: 'brand@example.com',
    nickname: '品牌管理员',
    status: 'active',
    role: 'brand_manager',
    createdAt: '2026-06-02',
  },
  {
    id: 'u_1003',
    email: 'disabled@example.com',
    nickname: '异常账号',
    status: 'disabled',
    role: 'member',
    createdAt: '2026-06-03',
  },
]
