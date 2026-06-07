import type { ManagedEnterprise } from '../types/admin'

export const enterprisesFixture: ManagedEnterprise[] = [
  {
    id: 'ent_1001',
    name: '瑞幸咖啡',
    status: 'active',
    members: 68,
    teams: 8,
    quotaUsed: 62,
    createdAt: '2026-05-18',
  },
  {
    id: 'ent_1002',
    name: '高校招生中心',
    status: 'active',
    members: 24,
    teams: 4,
    quotaUsed: 41,
    createdAt: '2026-05-24',
  },
  {
    id: 'ent_1003',
    name: '测试企业',
    status: 'disabled',
    members: 5,
    teams: 1,
    quotaUsed: 9,
    createdAt: '2026-06-04',
  },
]
