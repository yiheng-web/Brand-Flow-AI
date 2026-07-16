import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Modal, Input, Form, message } from 'antd'
import {
  FolderOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { getKnowledgeList, createKnowledge, deleteKnowledge } from '@/api/knowledge'
import type { KnowledgeData } from '@/api/knowledge'
import styles from './knowledge.module.css'

const KnowledgeListPage = () => {
  const navigate = useNavigate()
  const [list, setList] = useState<KnowledgeData[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = (await getKnowledgeList()) as unknown as KnowledgeData[]
      setList(res)
    } catch {
      message.error('加载知识库列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void fetchList())
  }, [fetchList])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      await createKnowledge(values)
      message.success('知识库创建成功')
      setCreateOpen(false)
      form.resetFields()
      fetchList()
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'errorFields' in err) return
      message.error('创建失败，请稍后重试')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (id: string, name: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除知识库「${name}」吗？该操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteKnowledge(id)
          message.success('已删除')
          fetchList()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <FolderOutlined className={styles.headerIcon} />
          <h1 className={styles.headerTitle}>知识库</h1>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建知识库
        </Button>
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>加载中...</div>
        ) : list.length === 0 ? (
          <Empty description="暂无知识库" className={styles.empty}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建知识库
            </Button>
          </Empty>
        ) : (
          <div className={styles.cardGrid}>
            {list.map((kb) => (
              <Card
                key={kb._id}
                className={styles.card}
                hoverable
                onClick={() => navigate(`/knowledge/${kb._id}`)}
                actions={[
                  <EditOutlined
                    key="rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      // TODO: rename modal
                      message.info('重命名功能待实现')
                    }}
                  />,
                  <DeleteOutlined
                    key="delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(kb._id, kb.name)
                    }}
                  />,
                ]}
              >
                <Card.Meta
                  avatar={<InboxOutlined className={styles.cardIcon} />}
                  title={kb.name}
                  description={kb.description || '暂无描述'}
                />
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        title="新建知识库"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false)
          form.resetFields()
        }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="name"
            label="知识库名称"
            rules={[{ required: true, message: '请输入知识库名称' }]}
          >
            <Input placeholder="例如：瑞幸咖啡品牌规范库" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="简要描述知识库的用途和内容范围（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default KnowledgeListPage
