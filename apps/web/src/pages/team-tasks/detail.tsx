import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Input, Select, Space, Tag, Timeline } from 'antd'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { TaskData } from '@brand-flow/contracts'
import { getTask, getTaskTimeline, taskCommand } from '@/api/tasks'
import { getSpaceMembers } from '@/api/org'
import type { AuditLogData, SpaceMemberData } from '@/api/org'
import { ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import { TASK_EVENT_LABELS, TASK_LABELS } from './task-labels'
import styles from '../tasks/tasks.module.css'

export default function TaskDetailPage() {
  const { id = '' } = useParams()
  const [query] = useSearchParams()
  const teamId = query.get('teamId') ?? ''
  const [task, setTask] = useState<TaskData>()
  const [timeline, setTimeline] = useState<AuditLogData[]>([])
  const [members, setMembers] = useState<SpaceMemberData[]>([])
  const [assigneeId, setAssigneeId] = useState<string>()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) {
        setLoading(true)
        setTask(undefined)
        setError(undefined)
      }
    })
    Promise.all([getTask(id, teamId), getTaskTimeline(id, teamId), getSpaceMembers(teamId)])
      .then(([next, events, people]) => {
        if (active) {
          setTask(next)
          setTimeline(events)
          setMembers(people.filter((person) => person.role !== 'viewer'))
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '任务详情加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id, teamId, revision])
  const handleCommand = async (action: 'accept' | 'decline' | 'cancel' | 'assign') => {
    if (!task || busy.current) return
    busy.current = true
    setSaving(true)
    try {
      await taskCommand(task, action, { assigneeId, reason })
      setRevision((value) => value + 1)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '操作失败，请刷新后重试')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  if (loading) return <LoadingState />
  if (!task)
    return (
      <ErrorState
        message={error || '任务不存在'}
        onRetry={() => setRevision((value) => value + 1)}
      />
    )
  return (
    <div className={styles.page}>
      <Link to="/team-tasks">返回团队任务</Link>
      <PageHeader title={task.title} description={task.description} />
      {error && (
        <Alert
          type="error"
          title={error}
          action={<Button onClick={() => setRevision((value) => value + 1)}>刷新重试</Button>}
        />
      )}
      <Tag>{TASK_LABELS[task.status]}</Tag>
      {task.overdue && <Tag color="red">已逾期</Tag>}
      <Card title="任务要求">
        <p>{task.requirementSnapshot.prompt}</p>
        <p>负责人：{task.assigneeId || '未指派'}</p>
        <p>
          截止：{task.deadline ? new Date(task.deadline).toLocaleString() : '未设置'} · 优先级：
          {task.priority}
        </p>
        <p>
          输出：{task.requirementSnapshot.needsComposition ? '图文' : '纯图'} · 渠道：
          {task.requirementSnapshot.channel || '未指定'}
        </p>
        <p>
          尺寸：{task.requirementSnapshot.generationConfig?.width || '默认'} ×{' '}
          {task.requirementSnapshot.generationConfig?.height || '默认'}
        </p>
        <p>
          附加知识：{task.requirementSnapshot.selectedKnowledgeBaseIds?.join('、') || '无'}
          （自动继承强制知识）
        </p>
        <p>
          参考素材：
          {task.requirementSnapshot.references?.map((reference) => reference.assetId).join('、') ||
            '无'}
        </p>
        {task.declineReason && (
          <Alert type="warning" title={`拒绝派发原因：${task.declineReason}`} />
        )}
      </Card>
      <Space wrap>
        {task.permissions.manage && task.status === 'draft' && (
          <>
            <Select
              aria-label="重新指派负责人"
              value={assigneeId}
              options={members.map((person) => ({
                value: person.userId,
                label: person.nickname || person.email,
              }))}
              onChange={setAssigneeId}
            />
            <Button disabled={saving || !assigneeId} onClick={() => void handleCommand('assign')}>
              派发任务
            </Button>
          </>
        )}
        {task.permissions.execute && task.status === 'pending' && (
          <>
            <Button loading={saving} onClick={() => void handleCommand('accept')}>
              接受任务
            </Button>
            <Input
              aria-label="拒绝原因"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
            />
            <Button
              disabled={saving || !reason.trim()}
              onClick={() => void handleCommand('decline')}
            >
              拒绝派发
            </Button>
          </>
        )}
        {task.permissions.manage &&
          ['draft', 'pending', 'accepted', 'in_progress', 'rejected'].includes(task.status) && (
            <Button danger disabled={saving} onClick={() => void handleCommand('cancel')}>
              取消任务
            </Button>
          )}
        <Button disabled={saving} onClick={() => setRevision((value) => value + 1)}>
          刷新详情
        </Button>
      </Space>
      <Card title="任务时间线">
        <Timeline
          items={timeline.map((event) => ({
            content: `${TASK_EVENT_LABELS[event.action] || event.action} · ${new Date(event.createdAt).toLocaleString()} · ${event.actorId}`,
          }))}
        />
      </Card>
    </div>
  )
}
