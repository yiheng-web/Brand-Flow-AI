import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Collapse, Descriptions, Image, List, Select, Space, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'

import { exportWork, getWork, type WorkData } from '@/api/works'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'

import styles from './detail.module.css'
import QualityReport from '@/components/QualityReport'

export default function WorkDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [work, setWork] = useState<WorkData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string>()
  const [compareVersionId, setCompareVersionId] = useState<string>()
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)
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
  const selectedVersion =
    work.versions?.find((version) => version._id === selectedVersionId) ?? work.versions?.[0]
  const comparison = work.versions?.find((version) => version._id === compareVersionId)
  const quality = selectedVersion?.qualityReport ?? work.qualityReport
  const preview = selectedVersion?.imageUrl ?? work.finalImageUrl
  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    setExportFailed(false)
    try {
      const result = await exportWork(work._id, selectedVersion?._id)
      const anchor = document.createElement('a')
      anchor.href = result.downloadUrl
      anchor.download = result.fileName
      anchor.click()
      message.success('已通过正式导出接口生成下载')
    } catch {
      setExportFailed(true)
    } finally {
      setExporting(false)
    }
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
          <Button
            aria-label="导出 PNG"
            loading={exporting}
            type="primary"
            icon={<DownloadOutlined aria-hidden />}
            onClick={() => void handleExport()}
          >
            导出 PNG
          </Button>
        }
      />
      {exportFailed && <Alert type="error" title="版本导出失败，请重试" />}

      <div className={styles.detailGrid}>
        <section className={styles.previewPanel}>
          {preview ? (
            <Image
              src={preview}
              alt={`${work.title} V${selectedVersion?.versionNo ?? 1}`}
              className={styles.previewImage}
            />
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
              {
                key: 'version',
                label: '查看版本',
                children: `V${selectedVersion?.versionNo ?? 1}`,
              },
              {
                key: 'created',
                label: '创建时间',
                children:
                  (selectedVersion?.createdAt ?? work.createdAt)
                    ? new Date(selectedVersion?.createdAt ?? work.createdAt!).toLocaleString(
                        'zh-CN',
                      )
                    : '—',
              },
            ]}
          />
          {quality && <QualityReport report={quality} />}
        </aside>
      </div>

      <section className={styles.records}>
        <Collapse
          items={[
            {
              key: 'nodes',
              label: '节点快照',
              children: (
                <pre>
                  {JSON.stringify(selectedVersion?.nodesSnapshot ?? work.nodesSnapshot, null, 2)}
                </pre>
              ),
            },
            {
              key: 'prompt',
              label: '本版 Prompt 与优化说明',
              children: (
                <Space orientation="vertical">
                  <p>{selectedVersion?.promptPlan?.imagePrompt ?? '此历史版本未记录 Prompt'}</p>
                  <p>{selectedVersion?.feedback?.instruction ?? '初始创作'}</p>
                </Space>
              ),
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
                <Button
                  aria-pressed={selectedVersion?._id === version._id}
                  onClick={() => {
                    setSelectedVersionId(version._id)
                    setCompareVersionId(undefined)
                  }}
                >
                  V{version.versionNo}
                </Button>
                <span>
                  {version.createdAt
                    ? new Date(version.createdAt).toLocaleString('zh-CN')
                    : '时间未知'}
                </span>
              </List.Item>
            )}
          />
          <Select
            aria-label="对比版本"
            placeholder="选择另一版本进行对比"
            allowClear
            value={compareVersionId}
            onChange={setCompareVersionId}
            options={(work.versions ?? [])
              .filter((version) => version._id !== selectedVersion?._id)
              .map((version) => ({ value: version._id, label: `V${version.versionNo}` }))}
          />
          {comparison && (
            <div className={styles.detailGrid}>
              <section>
                <h3>V{selectedVersion?.versionNo}</h3>
                <Image src={preview} alt="当前对比版本" />
              </section>
              <section>
                <h3>V{comparison.versionNo}</h3>
                <Image src={comparison.imageUrl} alt="历史对比版本" />
                {comparison.qualityReport && <QualityReport report={comparison.qualityReport} />}
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
