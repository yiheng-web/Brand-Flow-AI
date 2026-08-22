import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons'
import { Button, Collapse, Descriptions, Image, List, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'

import { exportWork, getWork, type WorkData } from '@/api/works'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'

import styles from './detail.module.css'

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
    <div className={styles.page}>
      <Button
        type="text"
        className={styles.backButton}
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/works')}
      >
        返回作品空间
      </Button>
      <PageHeader
        eyebrow="作品详情"
        title={work.title}
        description="查看成片、质检结果与创作节点快照"
        actions={
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => void handleExport()}>
            导出 PNG
          </Button>
        }
      />

      <div className={styles.detailGrid}>
        <section className={styles.previewPanel}>
          {work.finalImageUrl ? (
            <Image src={work.finalImageUrl} alt={work.title} className={styles.previewImage} />
          ) : (
            <EmptyState description="当前作品暂无预览图" />
          )}
        </section>

        <aside className={styles.infoPanel}>
          <h2>作品信息</h2>
          <Descriptions
            column={1}
            colon={false}
            items={[
              { key: 'workflow', label: '工作流', children: work.workflowId || '—' },
              { key: 'score', label: '质检分', children: work.qualityReport?.totalScore ?? '—' },
              {
                key: 'created',
                label: '创建时间',
                children: work.createdAt ? new Date(work.createdAt).toLocaleString('zh-CN') : '—',
              },
            ]}
          />
        </aside>
      </div>

      <section className={styles.records}>
        <Collapse
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
        <div className={styles.versionPanel}>
          <h2>版本记录</h2>
          <List
            locale={{ emptyText: '暂无历史版本' }}
            dataSource={work.versions || []}
            renderItem={(version) => (
              <List.Item>
                <b>版本 {version.versionNo}</b>
                <span>
                  {version.createdAt
                    ? new Date(version.createdAt).toLocaleString('zh-CN')
                    : '时间未知'}
                </span>
              </List.Item>
            )}
          />
        </div>
      </section>
    </div>
  )
}
