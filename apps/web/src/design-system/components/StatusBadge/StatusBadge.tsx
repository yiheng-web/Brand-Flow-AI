import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  LoadingOutlined,
  MinusCircleFilled,
  PauseCircleFilled,
  SettingFilled,
} from '@ant-design/icons'

import styles from './StatusBadge.module.css'

export type SemanticStatus =
  | 'unconfigured'
  | 'ready'
  | 'queued'
  | 'running'
  | 'success'
  | 'warning'
  | 'failed'
  | 'skipped'

const STATUS_META: Record<SemanticStatus, { label: string; icon: React.ReactNode }> = {
  unconfigured: { label: '待配置', icon: <SettingFilled /> },
  ready: { label: '已就绪', icon: <CheckCircleFilled /> },
  queued: { label: '排队中', icon: <ClockCircleFilled /> },
  running: { label: '执行中', icon: <LoadingOutlined /> },
  success: { label: '已完成', icon: <CheckCircleFilled /> },
  warning: { label: '需关注', icon: <ExclamationCircleFilled /> },
  failed: { label: '失败', icon: <CloseCircleFilled /> },
  skipped: { label: '已跳过', icon: <MinusCircleFilled /> },
}

interface StatusBadgeProps {
  status: SemanticStatus
  label?: string
}

export const StatusBadge = ({ status, label }: StatusBadgeProps) => {
  // 状态可能来自旧缓存或历史服务端数据，未知值不能导致整个页面崩溃。
  const resolvedStatus = STATUS_META[status] ? status : 'unconfigured'
  const meta = STATUS_META[resolvedStatus]
  return (
    <span className={`${styles.badge} ${styles[resolvedStatus]}`} aria-label={label || meta.label}>
      <span className={styles.icon} aria-hidden="true">
        {resolvedStatus === 'skipped' ? <PauseCircleFilled /> : meta.icon}
      </span>
      {label || meta.label}
    </span>
  )
}
