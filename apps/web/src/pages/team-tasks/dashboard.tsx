import { useEffect, useState } from 'react'
import { Alert, Button, Card, Space, Statistic } from 'antd'
import type { TaskDashboardData, TaskMetrics } from '@brand-flow/contracts'
import { getTaskDashboard } from '@/api/tasks'
import { LoadingState } from '@/design-system/components'

export default function TaskDashboard({ teamId, revision }: { teamId: string; revision: number }) {
  const [data, setData] = useState<TaskDashboardData>()
  const [error, setError] = useState<string>()
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    getTaskDashboard(teamId)
      .then((value) => {
        if (active) {
          setData(value)
          setError(undefined)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '仪表盘加载失败')
      })
    return () => {
      active = false
    }
  }, [teamId, revision, retry])
  const renderMetrics = (metrics: TaskMetrics, labels: Array<[keyof TaskMetrics, string]>) => (
    <Space wrap>
      {labels.map(([key, label]) => (
        <Statistic key={key} title={label} value={metrics[key]} />
      ))}
    </Space>
  )
  if (error)
    return (
      <Alert
        type="error"
        title={error}
        action={<Button onClick={() => setRetry((value) => value + 1)}>重试仪表盘</Button>}
      />
    )
  if (!data) return <LoadingState />
  return (
    <>
      {data.manager && (
        <Card title="团队概览">
          {renderMetrics(data.manager, [
            ['pending', '待接受'],
            ['inProgress', '进行中'],
            ['reviewing', '待审核'],
            ['overdue', '逾期'],
            ['completedWeek', '本周完成'],
          ])}
        </Card>
      )}
      <Card title="我的任务">
        {renderMetrics(data.mine, [
          ['todo', '我的待办'],
          ['inProgress', '进行中'],
          ['rejected', '待修改'],
          ['completed', '已完成'],
        ])}
      </Card>
    </>
  )
}
