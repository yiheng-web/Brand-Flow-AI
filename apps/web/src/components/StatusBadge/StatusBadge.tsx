import type { NodeStatus } from '@brand-flow/common'

import styles from './StatusBadge.module.css'

const labelMap: Record<NodeStatus, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  SUCCESS: '已完成',
  FAILED: '需处理',
}

const classMap: Record<NodeStatus, string> = {
  PENDING: styles.pending,
  RUNNING: styles.running,
  SUCCESS: styles.success,
  FAILED: styles.failed,
}

export function StatusBadge({ status }: { status: NodeStatus }) {
  return (
    <span className={`${styles.badge} ${classMap[status]}`}>
      <span className={styles.dot} />
      {labelMap[status]}
    </span>
  )
}
