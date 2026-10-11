import { useEffect, useRef, useState } from 'react'
import { Button, Card, Space, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { getNotifications, getUnreadNotificationCount, markNotificationRead } from '@/api/org'
import type { NotificationData } from '@/api/org'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import { TASK_EVENT_LABELS } from '../team-tasks/task-labels'
import styles from '../tasks/tasks.module.css'

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationData[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [busyId, setBusyId] = useState<string>()
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    Promise.all([getNotifications(), getUnreadNotificationCount()])
      .then(([notifications, unread]) => {
        if (active) {
          setItems(notifications)
          setCount(unread.count)
          setError(undefined)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '通知加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    const timer = setTimeout(() => {
      if (active) setRevision((value) => value + 1)
    }, 30000)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [revision])
  const handleRead = async (id: string) => {
    if (busy.current) return
    busy.current = true
    setBusyId(id)
    try {
      await markNotificationRead(id)
      setRevision((value) => value + 1)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '标记已读失败')
    } finally {
      busy.current = false
      setBusyId(undefined)
    }
  }
  return (
    <div className={styles.page}>
      <PageHeader title={`通知中心 · ${count} 条未读`} description="任务状态变化与组织通知" />
      <Button onClick={() => setRevision((value) => value + 1)}>刷新通知</Button>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRevision((value) => value + 1)} />
      ) : !items.length ? (
        <EmptyState description="暂无通知" />
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <Card key={item._id}>
              <Space wrap>
                <Tag>{item.readAt ? '已读' : '未读'}</Tag>
                <strong>{TASK_EVENT_LABELS[item.action] || item.action}</strong>
              </Space>
              <p>{new Date(item.createdAt).toLocaleString()}</p>
              <Space>
                {item.action.startsWith('task.') && item.teamId && (
                  <Link to={`/team-tasks/${item.resourceId}?teamId=${item.teamId}`}>查看任务</Link>
                )}
                {!item.readAt && (
                  <Button
                    disabled={!!busyId}
                    loading={busyId === item._id}
                    onClick={() => void handleRead(item._id)}
                  >
                    标记已读
                  </Button>
                )}
              </Space>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
