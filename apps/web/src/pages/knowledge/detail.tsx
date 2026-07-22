import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Input, Modal, Form, Select, Tag, message, Spin } from 'antd'
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
  ingestKnowledge,
} from '@/api/knowledge'
import type { KnowledgeData, KnowledgeItemData } from '@/api/knowledge'
import styles from './knowledge.module.css'

const { TextArea } = Input

const KnowledgeDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [kb, setKb] = useState<KnowledgeData | null>(null)
  const [items, setItems] = useState<KnowledgeItemData[]>([])
  const [loading, setLoading] = useState(true)

  // create item modal
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm()

  // ingest modal
  const [ingestOpen, setIngestOpen] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [ingestContent, setIngestContent] = useState('')

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [kbRes, itemsRes] = await Promise.all([
        getKnowledgeById(id) as unknown as KnowledgeData,
        getKnowledgeItems(id) as unknown as KnowledgeItemData[],
      ])
      setKb(kbRes)
      setItems(itemsRes)
    } catch {
      message.error('加载知识库数据失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    queueMicrotask(() => void fetchData())
  }, [fetchData])

  const handleCreateItem = async () => {
    if (!id) return
    try {
      const values = await createForm.validateFields()
      setCreating(true)
      await createKnowledgeItem(id, values)
      message.success('知识项创建成功')
      setCreateOpen(false)
      createForm.resetFields()
      fetchData()
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'errorFields' in err) return
      message.error('创建失败，请稍后重试')
    } finally {
      setCreating(false)
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
    if (!id || !ingestContent.trim()) return
    setIngesting(true)
    try {
      const res = await ingestKnowledge(id, { content: ingestContent.trim() })
      message.success(`向量化成功，共 ${res.chunks || 0} 个文本块`)
      setIngestOpen(false)
      setIngestContent('')
    } catch {
      message.error('向量化失败，请稍后重试')
    } finally {
      setIngesting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.detailWrapper}>
        <div
          className={styles.detailContent}
          style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
          <Spin tip="加载中..." />
        </div>
      </div>
    )
  }

  if (!kb) {
    return (
      <div className={styles.detailWrapper}>
        <div className={styles.detailContent}>
          <Empty description="知识库不存在">
            <Button onClick={() => navigate('/knowledge')}>返回列表</Button>
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.detailWrapper}>
      <div className={styles.detailHeader}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/knowledge')}>
          <ArrowLeftOutlined />
        </button>
        <h2 className={styles.detailTitle}>{kb.name}</h2>
        {kb.description && (
          <span style={{ color: '#999', fontSize: 13, marginLeft: 8 }}>{kb.description}</span>
        )}
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
        {items.length === 0 ? (
          <Empty description="暂无知识项，点击上方按钮添加">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增知识项
            </Button>
          </Empty>
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
                  {item.tags?.length > 0 &&
                    item.tags.map((tag) => (
                      <Tag key={tag} style={{ fontSize: 11 }}>
                        {tag}
                      </Tag>
                    ))}
                  <span>来源: {item.sourceType === 'asset' ? '素材' : '手动'}</span>
                  <span>状态: {item.status === 'active' ? '启用' : '归档'}</span>
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
        title="新增知识项"
        open={createOpen}
        onOk={handleCreateItem}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
        }}
        confirmLoading={creating}
        okText="创建"
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
            <Input placeholder="例如：品牌色使用规范" />
          </Form.Item>
          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入知识项内容' }]}
          >
            <TextArea rows={5} placeholder="输入知识项正文，创建后会自动写入向量库用于 AI 检索" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="输入标签后回车添加" style={{ width: '100%' }} />
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
        }}
        confirmLoading={ingesting}
        okText="导入并向量化"
        cancelText="取消"
        destroyOnClose
        width={640}
      >
        <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
          输入大段文本内容，系统会自动切分并写入向量库以便后续 AI 检索。
        </div>
        <TextArea
          rows={8}
          value={ingestContent}
          onChange={(e) => setIngestContent(e.target.value)}
          placeholder="粘贴需要导入的文本内容..."
        />
      </Modal>
    </div>
  )
}

export default KnowledgeDetailPage
