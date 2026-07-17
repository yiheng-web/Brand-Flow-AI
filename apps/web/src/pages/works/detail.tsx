import { useCallback, useEffect, useState } from 'react'
import { Button, Collapse, Descriptions, Image, List, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { exportWork, getWork, type WorkData } from '@/api/works'
import { ErrorState, LoadingState } from '@/design-system/components'

export default function WorkDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [work, setWork] = useState<WorkData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setWork(await getWork(id))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法加载作品')
    }
  }, [id])
  useEffect(() => {
    let active = true
    getWork(id)
      .then((data) => {
        if (active) {
          setWork(data)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法加载作品')
      })
    return () => {
      active = false
    }
  }, [id])
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!work) return <LoadingState />
  const handleExport = async () => {
    const result = await exportWork(work._id)
    const anchor = document.createElement('a')
    anchor.href = result.downloadUrl
    anchor.download = result.fileName
    anchor.click()
    message.success('已通过正式导出接口生成下载')
  }
  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <Button onClick={() => navigate('/works')}>返回作品中心</Button>
      <h1>{work.title}</h1>
      <Image
        src={work.finalImageUrl}
        alt={work.title}
        style={{ maxHeight: 560, objectFit: 'contain' }}
      />
      <Descriptions
        bordered
        style={{ marginTop: 24 }}
        items={[
          { key: 'workflow', label: 'Workflow', children: work.workflowId || '—' },
          { key: 'score', label: '质检分', children: work.qualityReport?.totalScore ?? '—' },
          {
            key: 'created',
            label: '创建时间',
            children: work.createdAt ? new Date(work.createdAt).toLocaleString() : '—',
          },
        ]}
      />
      <Button type="primary" style={{ marginTop: 20 }} onClick={handleExport}>
        正式导出 PNG
      </Button>
      <Collapse
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'nodes',
            label: '节点快照',
            children: <pre>{JSON.stringify(work.nodesSnapshot, null, 2)}</pre>,
          },
          {
            key: 'quality',
            label: '质检报告',
            children: <pre>{JSON.stringify(work.qualityReport, null, 2)}</pre>,
          },
        ]}
      />
      <h2>版本</h2>
      <List
        dataSource={work.versions || []}
        renderItem={(version) => (
          <List.Item>
            版本 {version.versionNo} ·{' '}
            {version.createdAt ? new Date(version.createdAt).toLocaleString() : ''}
          </List.Item>
        )}
      />
    </div>
  )
}
