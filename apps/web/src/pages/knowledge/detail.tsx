import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Card, Input, Modal, Form, Select, Tag, message, Upload, Alert } from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import {
  getKnowledgeById,
  getKnowledgeItems,
  createKnowledgeItem,
  deleteKnowledgeItem,
  updateKnowledgeItem,
  previewKnowledgeImport,
  confirmKnowledgeImport,
  retryKnowledgeVectorSync,
} from '@/api/knowledge'
import type { KnowledgeData, KnowledgeItemData, CreateKnowledgeItemParams } from '@/api/knowledge'
import type { KnowledgeImportItem } from '@brand-flow/contracts'
import { EmptyState, ErrorState, LoadingState } from '@/design-system/components'
import styles from './knowledge.module.css'

const { TextArea } = Input

const KnowledgeDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [kb, setKb] = useState<KnowledgeData | null>(null)
  const [items, setItems] = useState<KnowledgeItemData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState<KnowledgeItemData | null>(null)
  const [viewing, setViewing] = useState<KnowledgeItemData | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)

  // create item modal
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm<CreateKnowledgeItemParams>()

  // ingest modal
  const [ingestOpen, setIngestOpen] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [ingestContent, setIngestContent] = useState('')
  const [preview, setPreview] = useState<{ batchId: string; items: KnowledgeImportItem[] } | null>(
    null,
  )
  const [previewing, setPreviewing] = useState(false)

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [kbRes, itemsRes] = await Promise.all([getKnowledgeById(id), getKnowledgeItems(id)])
      setKb(kbRes)
      setItems(itemsRes)
      setError(null)
    } catch (reason: unknown) {
      setKb(null)
      setItems([])
      setError(reason instanceof Error ? reason.message : '知识库加载失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    queueMicrotask(() => void fetchData())
  }, [fetchData])

  const handleCreateItem = async () => {
    if (!id || creating) return
    try {
      const values = await createForm.validateFields()
      setActionError(null)
      setCreating(true)
      if (editing) {
        await updateKnowledgeItem(id, editing._id, values)
        message.success('知识项已更新')
      } else {
        const response = await createKnowledgeItem(id, values)
        if (response.ingest.failed) message.warning(response.ingest.message)
        else message.success(response.ingest.message)
      }
      setCreateOpen(false)
      createForm.resetFields()
      setEditing(null)
      fetchData()
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'errorFields' in err) return
      // 请求错误由 API 拦截器提示，保留表单以便重试。
      setActionError(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setCreating(false)
    }
  }

  const handleEdit = (item: KnowledgeItemData) => {
    setEditing(item)
    createForm.setFieldsValue({
      title: item.title,
      content: item.content,
      tags: item.tags,
      constraintLevel: item.constraintLevel ?? 'recommended',
    })
    setCreateOpen(true)
  }

  const handleToggleStatus = async (item: KnowledgeItemData) => {
    if (!id || busyItemId) return
    setBusyItemId(item._id)
    setActionError(null)
    try {
      await updateKnowledgeItem(id, item._id, {
        status: item.status === 'active' ? 'archived' : 'active',
      })
      await fetchData()
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : '状态更新失败，请重试')
    } finally {
      setBusyItemId(null)
    }
  }

  const handleRetryVector = async (item: KnowledgeItemData) => {
    if (!id || busyItemId) return
    setBusyItemId(item._id)
    setActionError(null)
    try {
      const result = await retryKnowledgeVectorSync(id, item._id)
      if (result.failed) message.warning(result.message)
      else message.success(result.message)
      await fetchData()
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : '向量同步失败，请重试')
    } finally {
      setBusyItemId(null)
    }
  }

  const handlePreview = async () => {
    if (!id || previewing) return
    setPreviewing(true)
    setActionError(null)
    try {
      setPreview(await previewKnowledgeImport(id, ingestContent))
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : '解析失败，请重试')
    } finally {
      setPreviewing(false)
    }
  }

  const handleDeleteItem = (itemId: string, title: string) => {
    if (!id) return
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除知识项「${title}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteKnowledgeItem(id, itemId)
          message.success('已删除')
          fetchData()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  const handleIngest = async () => {
    if (!id || !preview || ingesting) return
    setIngesting(true)
    try {
      const res = await confirmKnowledgeImport(id, preview.batchId, preview.items)
      if (res.failed) message.warning(res.message)
      else message.success(res.message)
      setIngestOpen(false)
      setIngestContent('')
      setPreview(null)
      await fetchData()
    } catch (reason: unknown) {
      // 保留 batchId 与预览条目，重试不会重复创建已写入的知识项。
      setActionError(reason instanceof Error ? reason.message : '导入失败，请重试')
    } finally {
      setIngesting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.detailWrapper}>
        <div className={styles.detailContent}>
          <LoadingState label="正在加载知识库…" />
        </div>
      </div>
    )
  }

  if (!kb) {
    return (
      <div className={styles.detailWrapper}>
        <div className={styles.detailContent}>
          {error ? (
            <ErrorState message={error} onRetry={() => void fetchData()} />
          ) : (
            <EmptyState
              description="知识库不存在或已被删除"
              action={<Button onClick={() => navigate('/knowledge')}>返回列表</Button>}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.detailWrapper}>
      <div className={styles.detailHeader}>
        <button
          type="button"
          aria-label="返回知识库列表"
          className={styles.backBtn}
          onClick={() => navigate('/knowledge')}
        >
          <ArrowLeftOutlined />
        </button>
        <div className={styles.detailHeading}>
          <span>知识库详情</span>
          <h2 className={styles.detailTitle}>{kb.name}</h2>
          {kb.description && <p>{kb.description}</p>}
        </div>
        <div className={styles.detailActions}>
          <Button icon={<FileTextOutlined />} onClick={() => setIngestOpen(true)}>
            批量导入文本
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新增知识项
          </Button>
        </div>
      </div>

      <div className={styles.detailContent}>
        {actionError && (
          <Alert
            type="error"
            showIcon
            message={actionError}
            closable
            onClose={() => setActionError(null)}
          />
        )}
        {items.length === 0 ? (
          <div className={styles.detailEmpty}>
            <EmptyState
              description="暂无知识项，添加后即可用于 AI 检索"
              action={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新增知识项
                </Button>
              }
            />
          </div>
        ) : (
          <div className={styles.itemList}>
            {items.map((item) => (
              <Card key={item._id} className={styles.itemCard} size="small">
                <div className={styles.itemTitle}>{item.title}</div>
                <div className={styles.itemContent}>{item.content}</div>
                <div className={styles.itemMeta}>
                  <Tag
                    color={
                      item.constraintLevel === 'required'
                        ? 'red'
                        : item.constraintLevel === 'optional'
                          ? 'default'
                          : 'blue'
                    }
                  >
                    {item.constraintLevel === 'required'
                      ? '强制约束'
                      : item.constraintLevel === 'optional'
                        ? '可选参考'
                        : '推荐约束'}
                  </Tag>
                  {item.tags?.length > 0 && item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  <span>
                    来源:{' '}
                    {item.sourceType === 'asset'
                      ? '素材'
                      : item.sourceType === 'import'
                        ? '批量导入'
                        : '手工'}
                  </span>
                  <span>状态: {item.status === 'active' ? '启用' : '归档'}</span>
                  <Button type="link" onClick={() => setViewing(item)}>
                    查看原文与来源
                  </Button>
                  <Button
                    type="link"
                    disabled={Boolean(busyItemId)}
                    onClick={() => handleEdit(item)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    loading={busyItemId === item._id}
                    disabled={Boolean(busyItemId)}
                    onClick={() => void handleToggleStatus(item)}
                  >
                    {item.status === 'active' ? '归档' : '启用'}
                  </Button>
                  {typeof item.metadata?.vectorSync === 'object' &&
                    item.metadata.vectorSync !== null &&
                    'failed' in item.metadata.vectorSync &&
                    item.metadata.vectorSync.failed === true && (
                      <Button
                        onClick={() => void handleRetryVector(item)}
                        disabled={Boolean(busyItemId)}
                      >
                        重试向量同步
                      </Button>
                    )}
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteItem(item._id, item.title)}
                  >
                    删除
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 新增知识项弹窗 */}
      <Modal
        title={editing ? '编辑知识项' : '新增知识项'}
        open={createOpen}
        onOk={handleCreateItem}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
          setEditing(null)
        }}
        confirmLoading={creating}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        destroyOnClose
        width={600}
      >
        <Form form={createForm} layout="vertical" autoComplete="off">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入知识项标题' }]}
          >
            <Input maxLength={80} placeholder="例如：品牌色使用规范" />
          </Form.Item>
          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入知识项内容' }]}
          >
            <TextArea
              rows={5}
              maxLength={5000}
              placeholder="输入规则正文，保存后即可用于当前空间创作"
            />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="输入标签后回车添加" />
          </Form.Item>
          <Form.Item name="constraintLevel" label="约束级别" initialValue="recommended">
            <Select
              options={[
                { value: 'required', label: '强制约束（必须遵守）' },
                { value: 'recommended', label: '推荐约束' },
                { value: 'optional', label: '可选参考' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入文本弹窗 */}
      <Modal
        title="批量导入文本"
        open={ingestOpen}
        onOk={handleIngest}
        onCancel={() => {
          setIngestOpen(false)
          setIngestContent('')
          setPreview(null)
        }}
        confirmLoading={ingesting}
        okText="确认导入"
        okButtonProps={{
          disabled:
            !preview || preview.items.some((item) => !item.title.trim() || !item.content.trim()),
        }}
        cancelButtonProps={{ disabled: ingesting || previewing }}
        closable={!ingesting && !previewing}
        maskClosable={!ingesting && !previewing}
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <div className={styles.modalHelp}>
          每个非空行导入一条规则，最多 200 条。可用 [required]、[recommended]、[optional]
          标注级别；预览后确认写入知识库。
        </div>
        <TextArea
          rows={8}
          value={ingestContent}
          disabled={ingesting || previewing}
          maxLength={100000}
          onChange={(e) => {
            setIngestContent(e.target.value)
            setPreview(null)
          }}
          placeholder="粘贴需要导入的文本内容..."
        />
        <Upload
          accept=".txt,.md,text/plain,text/markdown"
          showUploadList={false}
          disabled={ingesting || previewing}
          beforeUpload={async (file) => {
            if (file.size > 1024 * 1024) {
              message.error('文本文件不能超过 1 MiB')
              return false
            }
            try {
              setIngestContent(await file.text())
              setPreview(null)
            } catch {
              message.error('无法读取文本文件')
            }
            return false
          }}
        >
          <Button>上传文本文件</Button>
        </Upload>
        <Button
          onClick={() => void handlePreview()}
          loading={previewing}
          disabled={ingesting || !ingestContent.trim()}
        >
          解析并预览
        </Button>
        {preview && (
          <div className={styles.importPreview} aria-label="导入预览">
            <p>预览 {preview.items.length} 条规则，确认后持久保存。</p>
            {preview.items.map((item, index) => (
              <Card key={index} size="small">
                <Input
                  aria-label={`规则 ${index + 1} 标题`}
                  value={item.title}
                  maxLength={80}
                  disabled={ingesting}
                  onChange={(event) =>
                    setPreview({
                      ...preview,
                      items: preview.items.map((entry, i) =>
                        i === index ? { ...entry, title: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <TextArea
                  aria-label={`规则 ${index + 1} 内容`}
                  value={item.content}
                  maxLength={5000}
                  disabled={ingesting}
                  onChange={(event) =>
                    setPreview({
                      ...preview,
                      items: preview.items.map((entry, i) =>
                        i === index ? { ...entry, content: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <Select
                  aria-label={`规则 ${index + 1} 级别`}
                  value={item.constraintLevel}
                  disabled={ingesting}
                  options={[
                    { value: 'required', label: '强制约束' },
                    { value: 'recommended', label: '推荐约束' },
                    { value: 'optional', label: '可选参考' },
                  ]}
                  onChange={(constraintLevel) =>
                    setPreview({
                      ...preview,
                      items: preview.items.map((entry, i) =>
                        i === index ? { ...entry, constraintLevel } : entry,
                      ),
                    })
                  }
                />
              </Card>
            ))}
          </div>
        )}
      </Modal>
      <Modal
        title={viewing?.title || '知识项原文'}
        open={Boolean(viewing)}
        footer={null}
        onCancel={() => setViewing(null)}
      >
        <p>
          来源：
          {viewing?.sourceType === 'asset'
            ? '素材'
            : viewing?.sourceType === 'import'
              ? '批量导入'
              : '手工'}
        </p>
        {viewing?.assetId && (
          <p>
            来源素材 ID：{viewing.assetId}{' '}
            <Button onClick={() => navigate('/brand')}>查看素材库</Button>
          </p>
        )}
        {typeof viewing?.metadata?.importBatchId === 'string' && (
          <p>导入批次：{viewing.metadata.importBatchId}</p>
        )}
        <div className={styles.sourceContent}>{viewing?.content}</div>
      </Modal>
    </div>
  )
}

export default KnowledgeDetailPage
