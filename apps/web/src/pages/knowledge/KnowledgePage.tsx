import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Select, Switch, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'

import type { KnowledgeItem, KnowledgeType } from '@brand-flow/common'

import {
  createKnowledge,
  deleteKnowledge,
  listKnowledge,
  setKnowledgeEnabled,
  updateKnowledge,
} from '@/api/knowledge'
import { useUserStore } from '@/store/useUserStore'

import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_TYPE_LABELS } from './constants'
import { DeleteKnowledgeModal } from './components/DeleteKnowledgeModal'
import { KnowledgeFormModal } from './components/KnowledgeFormModal'
import styles from './KnowledgePage.module.css'

export function KnowledgePage() {
  const currentSpaceId = useUserStore((s) => s.currentSpaceId)
  const spaceId = currentSpaceId || 'personal'

  const [activeCategory, setActiveCategory] = useState<KnowledgeType | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<boolean | undefined>(undefined)
  const [tagFilter, setTagFilter] = useState('')
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<KnowledgeItem | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadItems = useCallback(async () => {
    setLoading(true)
    setApiError(null)
    try {
      const res = await listKnowledge({
        spaceId,
        type: activeCategory === 'all' ? undefined : activeCategory,
        enabled: enabledFilter,
        keyword: keyword.trim() || undefined,
        tags: tagFilter.trim() || undefined,
      })
      setItems(res.data)
    } catch {
      setApiError('无法加载品牌档案，请确认后端服务与 MongoDB 已启动。')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [spaceId, activeCategory, enabledFilter, keyword, tagFilter])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setApiError(null)
      try {
        const res = await listKnowledge({
          spaceId,
          type: activeCategory === 'all' ? undefined : activeCategory,
          enabled: enabledFilter,
          keyword: keyword.trim() || undefined,
          tags: tagFilter.trim() || undefined,
        })
        if (!cancelled) setItems(res.data)
      } catch {
        if (!cancelled) {
          setApiError('无法加载品牌档案，请确认后端服务与 MongoDB 已启动。')
          setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [spaceId, activeCategory, enabledFilter, keyword, tagFilter])

  const handleFormSubmit = async (values: {
    type: KnowledgeType
    title: string
    description?: string
    tags: string[]
    content: KnowledgeItem['content']
    assetUrl?: string
    enabled: boolean
  }) => {
    setFormLoading(true)
    try {
      if (editing) {
        await updateKnowledge(editing.id, values)
        message.success('已更新')
      } else {
        await createKnowledge({ spaceId, ...values })
        message.success('已创建')
      }
      setFormOpen(false)
      setEditing(null)
      void loadItems()
    } catch {
      message.error('保存失败')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await deleteKnowledge(deleting.id)
      message.success('已删除')
      setDeleteOpen(false)
      setDeleting(null)
      void loadItems()
    } catch {
      message.error('删除失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns: ColumnsType<KnowledgeItem> = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (t: KnowledgeType) => KNOWLEDGE_TYPE_LABELS[t],
    },
    {
      title: '标签',
      dataIndex: 'tags',
      render: (tags: string[]) => tags.join(', ') || '—',
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          onChange={async (checked) => {
            try {
              await setKnowledgeEnabled(record.id, { enabled: checked })
              void loadItems()
            } catch {
              message.error('更新失败')
            }
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <>
          <Button
            size="small"
            type="link"
            onClick={() => {
              setEditing(record)
              setFormOpen(true)
            }}
          >
            编辑
          </Button>
          <Button
            danger
            size="small"
            type="link"
            onClick={() => {
              setDeleting(record)
              setDeleteOpen(true)
            }}
          >
            删除
          </Button>
        </>
      ),
    },
  ]

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTitle}>品牌档案</div>
        <button
          className={`${styles.categoryItem} ${activeCategory === 'all' ? styles.categoryActive : ''}`}
          type="button"
          onClick={() => setActiveCategory('all')}
        >
          全部
        </button>
        {KNOWLEDGE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`${styles.categoryItem} ${activeCategory === cat ? styles.categoryActive : ''}`}
            type="button"
            onClick={() => setActiveCategory(cat)}
          >
            {KNOWLEDGE_TYPE_LABELS[cat]}
          </button>
        ))}
      </aside>

      <main className={styles.main}>
        <h2 style={{ marginTop: 0 }}>品牌档案</h2>
        <p style={{ color: '#666', marginBottom: 16 }}>
          空间：{spaceId} — 维护品牌调性、视觉规范与生成约束，供 AI 工作流引用。
        </p>

        {apiError && <div className={styles.errorBanner}>{apiError}</div>}

        <div className={styles.toolbar}>
          <Input.Search
            allowClear
            placeholder="搜索标题或描述"
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => void loadItems()}
          />
          <Select
            allowClear
            placeholder="启用状态"
            style={{ width: 120 }}
            value={enabledFilter}
            options={[
              { value: true, label: '已启用' },
              { value: false, label: '已禁用' },
            ]}
            onChange={(v) => setEnabledFilter(v)}
          />
          <Input
            allowClear
            placeholder="标签筛选（逗号分隔）"
            style={{ width: 180 }}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadItems()}>
            刷新
          </Button>
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            新增
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
          locale={{ emptyText: apiError ? '加载失败' : '暂无知识条目，点击新增开始维护品牌档案' }}
        />
      </main>

      <KnowledgeFormModal
        defaultType={activeCategory === 'all' ? undefined : activeCategory}
        editing={editing}
        loading={formLoading}
        open={formOpen}
        spaceId={spaceId}
        onCancel={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={(v) => void handleFormSubmit(v)}
      />

      <DeleteKnowledgeModal
        loading={deleteLoading}
        open={deleteOpen}
        title={deleting?.title ?? ''}
        onCancel={() => {
          setDeleteOpen(false)
          setDeleting(null)
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
