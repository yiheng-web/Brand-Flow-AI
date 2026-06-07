import type { AuditLog } from '../types/admin'

export const auditLogsFixture: AuditLog[] = [
  {
    id: 'log_1001',
    actor: 'ops@example.com',
    action: 'DISABLE_USER',
    targetType: 'user',
    targetName: 'disabled@example.com',
    createdAt: '2026-06-07 09:12',
  },
  {
    id: 'log_1002',
    actor: 'super@example.com',
    action: 'UPDATE_ENTERPRISE_POLICY',
    targetType: 'enterprise',
    targetName: '瑞幸咖啡',
    createdAt: '2026-06-07 10:26',
  },
]
