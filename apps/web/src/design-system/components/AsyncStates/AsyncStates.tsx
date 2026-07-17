import type { ReactNode } from 'react'
import { Button, Empty, Result, Skeleton, Spin } from 'antd'

export const LoadingState = ({ label = '正在加载…' }: { label?: string }) => (
  <div aria-live="polite" style={{ padding: 40, textAlign: 'center' }}>
    <Spin /> <span>{label}</span>
    <Skeleton active paragraph={{ rows: 3 }} style={{ marginTop: 20 }} />
  </div>
)
export const EmptyState = ({
  description,
  action,
}: {
  description: ReactNode
  action?: ReactNode
}) => <Empty description={description}>{action}</Empty>
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Result
    status="error"
    title="加载失败"
    subTitle={message}
    extra={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
  />
)
export const AsyncButton = Button
