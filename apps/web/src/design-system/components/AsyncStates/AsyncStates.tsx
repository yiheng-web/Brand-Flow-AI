import type { ReactNode } from 'react'
import { Button, Empty, Result, Skeleton, Spin } from 'antd'

import styles from './AsyncStates.module.css'

export const LoadingState = ({ label = '正在加载…' }: { label?: string }) => (
  <div className={styles.state} aria-live="polite">
    <div className={styles.loading}>
      <Spin />
      <span className={styles.loadingLabel}>{label}</span>
      <Skeleton active paragraph={{ rows: 3 }} className={styles.skeleton} />
    </div>
  </div>
)
export const EmptyState = ({
  description,
  action,
}: {
  description: ReactNode
  action?: ReactNode
}) => (
  <div className={styles.state}>
    <Empty description={description}>{action}</Empty>
  </div>
)
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Result
    status="error"
    title="加载失败"
    subTitle={message}
    extra={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
  />
)
export const AsyncButton = Button
