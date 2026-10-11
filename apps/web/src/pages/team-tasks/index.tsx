import { useEffect, useState } from 'react'
import { Button, Card, Pagination, Select, Space, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { TaskPage, TaskStatus } from '@brand-flow/contracts'
import { listTasks } from '@/api/tasks'
import { useUserStore } from '@/store/useUserStore'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import TaskCreate from './task-create'
import { TASK_LABELS } from './task-labels'
import styles from '../tasks/tasks.module.css'

export default function TeamTasksPage() {
  const spaces = useUserStore((state) => state.spaces)
  const currentId = useUserStore((state) => state.currentSpaceId)
  const [selectedTeam, setSelectedTeam] = useState<string>()
  const teams = spaces.filter((space) => space.type === 'team')
  const teamId = selectedTeam ?? teams.find((team) => team.id === currentId)?.id ?? teams[0]?.id
  const canManage = teams.find((team) => team.id === teamId)?.permissions?.assignTasks
  const [view, setView] = useState('mine')
  const [status, setStatus] = useState<TaskStatus>()
  const [deadline, setDeadline] = useState<string>()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<TaskPage>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) {
        setLoading(true)
        setError(undefined)
      }
    })
    if (teamId)
      listTasks({ teamId, view, status, deadline, page })
        .then((value) => {
          if (active) setData(value)
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : '任务加载失败')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    return () => {
      active = false
    }
  }, [teamId, view, status, deadline, page, revision])
  if (!teamId) return <EmptyState description="请先加入团队，再使用团队任务" />
  return (
    <div className={styles.page}>
      <PageHeader title="团队任务" description="派发、执行与交付审核" />
      <Space wrap>
        <Select
          aria-label="任务团队"
          value={teamId}
          options={teams.map((team) => ({ value: team.id, label: team.name }))}
          onChange={(value) => {
            setSelectedTeam(value)
            setPage(1)
            setCreating(false)
          }}
        />
        <Select
          aria-label="任务范围"
          value={view}
          options={[
            { value: 'mine', label: '我的待办' },
            { value: 'created-by-me', label: '我创建的' },
            { value: 'team', label: '团队全部' },
          ]}
          onChange={(value) => {
            setView(value)
            setPage(1)
          }}
        />
        <Select
          aria-label="业务任务状态"
          value={status ?? 'all'}
          options={[
            { value: 'all', label: '全部状态' },
            ...Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          onChange={(value) => {
            setStatus(value === 'all' ? undefined : (value as TaskStatus))
            setPage(1)
          }}
        />
        <Select
          aria-label="截止筛选"
          value={deadline ?? 'all'}
          options={[
            { value: 'all', label: '全部期限' },
            { value: 'overdue', label: '已逾期' },
            { value: 'upcoming', label: '即将到期' },
          ]}
          onChange={(value) => {
            setDeadline(value === 'all' ? undefined : value)
            setPage(1)
          }}
        />
        <Button onClick={() => setRevision((value) => value + 1)}>刷新</Button>
        {canManage && (
          <Button type="primary" onClick={() => setCreating(true)}>
            创建任务
          </Button>
        )}
      </Space>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRevision((value) => value + 1)} />
      ) : !data?.items.length ? (
        <EmptyState description="当前筛选下暂无团队任务" />
      ) : (
        <>
          <div className={styles.list}>
            {data.items.map((task) => (
              <Card key={task.id}>
                <Link to={`/team-tasks/${task.id}?teamId=${teamId}`}>{task.title}</Link>
                <Tag>{TASK_LABELS[task.status]}</Tag>
                {task.overdue && <Tag color="red">已逾期</Tag>}
                <p>{task.description}</p>
                <p>
                  负责人：{task.assigneeId || '未指派'} · 截止：
                  {task.deadline ? new Date(task.deadline).toLocaleString() : '未设置'}
                </p>
              </Card>
            ))}
          </div>
          <Pagination
            current={page}
            pageSize={20}
            total={data.total}
            showSizeChanger={false}
            onChange={setPage}
          />
        </>
      )}
      {creating && (
        <TaskCreate
          key={teamId}
          teamId={teamId}
          onClose={() => setCreating(false)}
          onCreated={() => setRevision((value) => value + 1)}
        />
      )}
    </div>
  )
}
