import { Tag } from 'antd'

interface StatusTagProps {
  status: string
}

const statusColor: Record<string, string> = {
  active: 'green',
  disabled: 'red',
  pending_review: 'gold',
  rejected: 'red',
}

export function StatusTag({ status }: StatusTagProps) {
  return <Tag color={statusColor[status] ?? 'default'}>{status}</Tag>
}
