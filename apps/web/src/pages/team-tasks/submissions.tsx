import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Image, Input, Select, Space, Tag } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import type { SubmissionData, TaskData, TaskDeliverable } from '@brand-flow/contracts'
import { getDeliverables, getSubmissions, resumeTask, reviewTask, submitTask } from '@/api/tasks'
import { getWorkVersion } from '@/api/works'
import type { WorkVersionData } from '@/api/works'
import QualityReport from '@/components/QualityReport'
import { LoadingState } from '@/design-system/components'

function VersionPreview({ workId, versionId }: { workId: string; versionId: string }) {
  const [version, setVersion] = useState<WorkVersionData>()
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    getWorkVersion(workId, versionId)
      .then((value) => {
        if (active) {
          setVersion(value)
          setError(undefined)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '版本预览失败')
      })
    return () => {
      active = false
    }
  }, [workId, versionId, revision])
  return error ? (
    <Alert
      type="error"
      title={error}
      action={<Button onClick={() => setRevision((value) => value + 1)}>重试预览</Button>}
    />
  ) : version ? (
    <>
      <p>
        作品版本 V{version.versionNo} · 执行版本 {version.sourceRunVersion} · Revision{' '}
        {version.sourceRevisionId || '初始'}
      </p>
      <Image src={version.imageUrl} alt={`成果版本 ${version.versionNo}`} />
      {version.qualityReport && <QualityReport report={version.qualityReport} />}
    </>
  ) : (
    <LoadingState />
  )
}

export default function SubmissionsPanel({
  task,
  onChanged,
}: {
  task: TaskData
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [history, setHistory] = useState<SubmissionData[]>([])
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [comment, setComment] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    Promise.all([
      getSubmissions(task),
      task.permissions.execute && task.status === 'in_progress'
        ? getDeliverables(task)
        : Promise.resolve([]),
    ])
      .then(([submissions, options]) => {
        if (active) {
          setHistory(submissions)
          setDeliverables(options)
          setError(undefined)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '提交记录加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [task, revision])
  const handleAction = async (action: 'submit' | 'approve' | 'reject' | 'resume') => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    try {
      if (action === 'submit') {
        const selected = deliverables.find((item) => item.workVersionId === selectedId)
        if (!selected) {
          setError('请选择成果版本')
          return
        }
        await submitTask(task, selected, comment)
      } else if (action === 'resume') {
        const next = await resumeTask(task)
        navigate(`/workspace?workflowId=${next.activeWorkflowId}`)
      } else if (task.latestSubmissionId)
        await reviewTask(task, task.latestSubmissionId, action, reason)
      onChanged()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '操作失败，请刷新后重试')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  if (loading) return <LoadingState />
  const selected = deliverables.find((item) => item.workVersionId === selectedId)
  return (
    <Card title="成果提交与审核">
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button
              onClick={() => {
                setRevision((value) => value + 1)
                onChanged()
              }}
            >
              刷新重试
            </Button>
          }
        />
      )}
      {task.permissions.execute && task.status === 'in_progress' && (
        <Space orientation="vertical">
          <Select
            aria-label="提交成果版本"
            value={selectedId}
            placeholder="选择已保存的成果版本"
            options={deliverables.map((item) => ({
              value: item.workVersionId,
              label: `${item.title} · V${item.versionNo}`,
            }))}
            onChange={setSelectedId}
          />
          {!deliverables.length && <p>请先完成工作流并在作品空间保存最新成果。</p>}
          <Input.TextArea
            aria-label="提交说明"
            value={comment}
            maxLength={2000}
            onChange={(event) => setComment(event.target.value)}
          />
          <Button
            type="primary"
            disabled={saving || !selected}
            loading={saving}
            onClick={() => void handleAction('submit')}
          >
            提交成果
          </Button>
          {selected && (
            <VersionPreview
              key={selected.workVersionId}
              workId={selected.workId}
              versionId={selected.workVersionId}
            />
          )}
        </Space>
      )}
      {history.map((submission) => (
        <Card key={submission.id} title={`第 ${submission.round} 轮提交`}>
          <Tag>{submission.status}</Tag>
          <p>{submission.comment}</p>
          <p>提交于 {new Date(submission.createdAt).toLocaleString()}</p>
          {submission.reviewComment && (
            <Alert
              type={submission.status === 'rejected' ? 'warning' : 'info'}
              title={`审核意见：${submission.reviewComment}`}
            />
          )}
          <Link to={`/works/${submission.workId}`}>查看作品与版本历史</Link>
          <VersionPreview workId={submission.workId} versionId={submission.workVersionId} />
        </Card>
      ))}
      {task.permissions.review && task.status === 'reviewing' && (
        <Space orientation="vertical">
          <Input.TextArea
            aria-label="审核意见"
            value={reason}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
          />
          <Space>
            <Button disabled={saving} loading={saving} onClick={() => void handleAction('approve')}>
              审核通过
            </Button>
            <Button
              danger
              disabled={saving || !reason.trim()}
              onClick={() => void handleAction('reject')}
            >
              驳回成果
            </Button>
          </Space>
        </Space>
      )}
      {task.permissions.execute && task.status === 'rejected' && (
        <Button type="primary" loading={saving} onClick={() => void handleAction('resume')}>
          按审核意见继续修改
        </Button>
      )}
    </Card>
  )
}
