import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Pagination, Progress, Select, Space, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { WorkflowStatus } from '@brand-flow/contracts'
import { cancelWorkflow, listWorkflows, retryWorkflow } from '@/api/workflow'
import type { WorkflowListResponse } from '@/api/workflow'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'
import { FLOW_NODES } from '../workspace/workspace.const'
import styles from './tasks.module.css'

const LABELS: Record<WorkflowStatus, string> = {
  pending: '待启动',
  running: '进行中',
  awaiting_user: '等待用户',
  failed: '失败',
  completed: '已完成',
  cancelled: '已取消',
}

export default function TasksPage() {
  const navigate = useNavigate()
  const spaceId = useUserStore((state) => state.currentSpaceId) || 'personal'
  const [status, setStatus] = useState<WorkflowStatus | undefined>()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<WorkflowListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listWorkflows({ spaceId, status, page, limit: 20 }))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '任务列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [spaceId, status, page])
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    listWorkflows({ spaceId, status, page, limit: 20 })
      .then((response) => {
        if (active) {
          setData(response)
          setError(null)
          setLoading(false)
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : '任务列表加载失败')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [spaceId, status, page])
  const handleAction = async (id: string, action: 'cancel' | 'retry') => {
    if (busy) return
    setBusy(id)
    try {
      if (action === 'cancel') await cancelWorkflow(id)
      else await retryWorkflow(id)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请重试')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className={styles.page}>
      <PageHeader title="创作任务" description="任务进度由服务端保存，可刷新或从其他设备继续创作" />
      <Select
        aria-label="任务状态"
        value={status ?? 'all'}
        options={[
          { value: 'all', label: '全部任务' },
          ...Object.entries(LABELS).map(([value, label]) => ({ value, label })),
        ]}
        onChange={(value) => {
          setStatus(value === 'all' ? undefined : (value as WorkflowStatus))
          setPage(1)
          setLoading(true)
        }}
      />
      {loading ? (
        <LoadingState label="正在加载任务…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data?.items.length ? (
        <EmptyState description="当前筛选下暂无创作任务" />
      ) : (
        <>
          <div className={styles.list}>
            {data.items.map((task) => (
              <Card key={task.id}>
                <div className={styles.heading}>
                  <h3>{task.prompt}</h3>
                  <Tag>{LABELS[task.status]}</Tag>
                </div>
                <Progress
                  percent={task.progress}
                  status={task.status === 'failed' ? 'exception' : undefined}
                />
                <p>
                  更新于 {new Date(task.updatedAt).toLocaleString()}{' '}
                  {task.currentNode
                    ? `· 当前节点 ${FLOW_NODES.find((node) => node.id === task.currentNode)?.title ?? task.currentNode}`
                    : ''}
                </p>
                {task.errorMessage && <p role="alert">{task.errorMessage}</p>}
                <Space wrap>
                  <Button
                    onClick={() => navigate(`/workspace?workflowId=${encodeURIComponent(task.id)}`)}
                  >
                    {task.status === 'completed'
                      ? '查看创作结果'
                      : task.status === 'cancelled'
                        ? '查看任务'
                        : '继续创作'}
                  </Button>
                  {task.status === 'failed' && (
                    <Button
                      disabled={Boolean(busy)}
                      loading={busy === task.id}
                      onClick={() => void handleAction(task.id, 'retry')}
                    >
                      重试
                    </Button>
                  )}
                  {!['completed', 'cancelled'].includes(task.status) && (
                    <Button
                      danger
                      disabled={Boolean(busy)}
                      loading={busy === task.id}
                      onClick={() => void handleAction(task.id, 'cancel')}
                    >
                      取消任务
                    </Button>
                  )}
                  {task.status === 'completed' && (
                    <Button onClick={() => navigate('/works')}>查看作品</Button>
                  )}
                </Space>
              </Card>
            ))}
          </div>
          <Pagination
            current={page}
            pageSize={20}
            total={data.total}
            showSizeChanger={false}
            onChange={(value) => {
              setPage(value)
              setLoading(true)
            }}
          />
        </>
      )}
    </div>
  )
}
