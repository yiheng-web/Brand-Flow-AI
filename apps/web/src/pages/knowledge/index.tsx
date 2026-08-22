import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Modal, Input, Form, Select, message } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  getKnowledgeList,
  createKnowledge,
  deleteKnowledge,
  updateKnowledge,
} from '@/api/knowledge'
import type { KnowledgeData } from '@/api/knowledge'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'
import styles from './knowledge.module.css'

const KnowledgeListPage = () => {
  const navigate = useNavigate()
  const [list, setList] = useState<KnowledgeData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameTarget, setRenameTarget] = useState<KnowledgeData | null>(null)
  const [renameName, setRenameName] = useState('')
  const [query, setQuery] = useState('')
  const [form] = Form.useForm()
  const spaceId = useUserStore((state) => state.currentSpaceId) || 'personal'
  const spaceType = useUserStore((state) => state.currentSpaceType)
  const spaceName = useUserStore((state) => state.currentSpaceName)
  const filteredList = list.filter((item) =>
    `${item.name} ${item.description || ''}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  )

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = (await getKnowledgeList(spaceId)) as unknown as KnowledgeData[]
      setList(res)
      setError(null)
    } catch (reason) {
      setList([])
      setError(reason instanceof Error ? reason.message : '无法加载知识库')
    } finally {
      setLoading(false)
    }
  }, [spaceId])

  useEffect(() => {
    queueMicrotask(() => void fetchList())
  }, [fetchList])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      await createKnowledge({ ...values, spaceId })
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

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return
    setRenaming(true)
    try {
      await updateKnowledge(renameTarget._id, { name: renameName.trim() })
      message.success('知识库已重命名')
      setRenameTarget(null)
      setRenameName('')
      await fetchList()
    } catch {
      message.error('重命名失败')
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <PageHeader
        title="知识库"
        description="组织共用的品牌资料、创作素材与规则中心"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建知识库
          </Button>
        }
      />

      <div className={styles.scopeNotice}>
        <span>{spaceName.slice(0, 1)}</span>
        <p>
          <b>{spaceName}的知识范围</b>
          <small>知识库只用于当前空间创作，切换空间后会刷新可用范围。</small>
        </p>
      </div>

      <div className={styles.toolbar}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索知识库"
        />
        <span>{filteredList.length} 个知识库</span>
      </div>

      <div className={styles.content}>
        {loading ? (
          <LoadingState label="正在加载知识库…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void fetchList()} />
        ) : filteredList.length === 0 ? (
          <EmptyState
            description={query ? '没有匹配的知识库' : '当前空间暂无知识库'}
            action={
              query ? (
                <Button onClick={() => setQuery('')}>清除搜索</Button>
              ) : (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新建知识库
                </Button>
              )
            }
          />
        ) : (
          <div className={styles.cardGrid}>
            {filteredList.map((kb, index) => (
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
                      setRenameTarget(kb)
                      setRenameName(kb.name)
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
                <span className={`${styles.libraryCover} ${styles[`cover${index % 4}`]}`}>
                  <InboxOutlined />
                </span>
                <Card.Meta title={kb.name} description={kb.description || '暂无描述'} />
                <div className={styles.cardMeta}>
                  <span>{kb.isRequired ? '企业规则' : '可用于创作'}</span>
                  <span>
                    {kb.updatedAt ? new Date(kb.updatedAt).toLocaleDateString('zh-CN') : '时间未知'}
                  </span>
                </div>
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
          {spaceType === 'enterprise' && (
            <Form.Item name="isRequired" label="企业规则" initialValue={false}>
              <Select
                options={[
                  { value: false, label: '普通企业知识库' },
                  { value: true, label: '强制知识库（团队空间自动启用）' },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
      <Modal
        title="重命名知识库"
        open={Boolean(renameTarget)}
        onOk={() => void handleRename()}
        onCancel={() => setRenameTarget(null)}
        confirmLoading={renaming}
        okButtonProps={{ disabled: !renameName.trim() }}
        destroyOnClose
      >
        <Input
          value={renameName}
          onChange={(event) => setRenameName(event.target.value)}
          maxLength={80}
          placeholder="输入新的知识库名称"
        />
      </Modal>
    </div>
  )
}

export default KnowledgeListPage
