import { useState, useEffect, useMemo, useCallback } from 'react'
import { Input, Tag, Empty, Button, Modal, message, Dropdown } from 'antd'
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  MoreOutlined,
  DeleteOutlined,
  ArchiveOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  getWorks,
  deleteWork,
  archiveWork,
  restoreWork,
  retryWork,
  downloadWork,
  WORK_STATUS_MAP,
  type WorkData,
  type WorkStatus,
} from '@/api/work'
import styles from './works.module.css'

type FilterKey = 'all' | WorkStatus
type ViewMode = 'grid' | 'list'

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'in_progress', label: '创作中' },
  { key: 'awaiting_review', label: '等待确认' },
  { key: 'failed', label: '失败' },
  { key: 'completed', label: '已完成' },
]

const Works = () => {
  const navigate = useNavigate()

  const [works, setWorks] = useState<WorkData[]>([])
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [keyword, setKeyword] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  /* ============================
      加载作品列表
   ============================ */
  const loadWorks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWorks({ status: activeFilter === 'all' ? undefined : activeFilter })
      if (Array.isArray(res)) {
        setWorks(res)
      }
    } catch {
      console.warn('[MOCK] 使用模拟作品数据，后端接口未实现')
      setWorks(getMockWorks())
    } finally {
      setLoading(false)
    }
  }, [activeFilter])

  useEffect(() => {
    loadWorks()
  }, [loadWorks])

  /* ============================
      搜索 + 筛选
   ============================ */
  const filteredWorks = useMemo(() => {
    let result = works
    if (activeFilter !== 'all') {
      result = result.filter((w) => w.status === activeFilter)
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      result = result.filter(
        (w) => w.title.toLowerCase().includes(kw) || w.source.toLowerCase().includes(kw),
      )
    }
    return result
  }, [works, activeFilter, keyword])

  /* ============================
      统计各状态作品数
   ============================ */
  const workCounts = useMemo(() => {
    const counts: Partial<Record<FilterKey, number>> = { all: works.length }
    for (const tab of FILTER_TABS) {
      if (tab.key !== 'all') {
        counts[tab.key] = works.filter((w) => w.status === tab.key).length
      }
    }
    return counts
  }, [works])

  /* ============================
      操作处理
   ============================ */
  const handleWorkClick = (workId: string) => {
    navigate(`/works/${workId}`)
  }

  const handleDownload = async (e: React.MouseEvent, workId: string) => {
    e.stopPropagation()
    try {
      const res = await downloadWork(workId)
      if (res?.url) {
        window.open(res.url, '_blank')
      }
      message.success('下载开始')
    } catch {
      console.warn('[MOCK] 下载模拟')
      message.success('下载已开始（模拟）')
    }
  }

  const handleRetry = async (e: React.MouseEvent, workId: string) => {
    e.stopPropagation()
    Modal.confirm({
      title: '重试生成',
      content: '将重新生成该作品，之前的结果将被覆盖。',
      okText: '确认重试',
      onOk: async () => {
        try {
          await retryWork(workId)
          message.success('已提交重试')
          loadWorks()
        } catch {
          console.warn('[MOCK] 重试模拟成功')
          message.success('已提交重试（模拟）')
          setWorks((prev) =>
            prev.map((w) => (w._id === workId ? { ...w, status: 'in_progress' } : w)),
          )
        }
      },
    })
  }

  const handleDelete = async (e: React.MouseEvent, workId: string) => {
    e.stopPropagation()
    Modal.confirm({
      title: '删除作品',
      content: '删除后不可恢复，是否确认？',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteWork(workId)
          message.success('作品已删除')
          loadWorks()
        } catch {
          console.warn('[MOCK] 删除模拟成功')
          message.success('作品已删除（模拟）')
          setWorks((prev) => prev.filter((w) => w._id !== workId))
        }
      },
    })
  }

  const handleArchive = async (e: React.MouseEvent, workId: string) => {
    e.stopPropagation()
    try {
      await archiveWork(workId)
      message.success('已归档')
      loadWorks()
    } catch {
      console.warn('[MOCK] 归档模拟成功')
      message.success('已归档（模拟）')
      setWorks((prev) =>
        prev.map((w) => (w._id === workId ? { ...w, status: 'archived', isArchived: true } : w)),
      )
    }
  }

  const handleRestore = async (e: React.MouseEvent, workId: string) => {
    e.stopPropagation()
    try {
      await restoreWork(workId)
      message.success('已恢复')
      loadWorks()
    } catch {
      console.warn('[MOCK] 恢复模拟成功')
      message.success('已恢复（模拟）')
      setWorks((prev) =>
        prev.map((w) => (w._id === workId ? { ...w, status: 'completed', isArchived: false } : w)),
      )
    }
  }

  /* ============================
      渲染作品卡片（网格模式）
   ============================ */
  const renderWorkCard = (work: WorkData) => {
    const statusInfo = WORK_STATUS_MAP[work.status]
    const isCompleted = work.status === 'completed'
    const isFailed = work.status === 'failed'
    const isInProgress = work.status === 'in_progress'
    const isAwaiting = work.status === 'awaiting_review'
    const isArchived = work.isArchived || work.status === 'archived'

    const cardActions = (
      <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
        {isCompleted && (
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={(e) => handleDownload(e, work._id)}
          >
            下载
          </Button>
        )}
        {(isInProgress || isAwaiting) && (
          <Button
            size="small"
            type="primary"
            onClick={(e) => {
              e.stopPropagation()
              handleWorkClick(work._id)
            }}
          >
            继续创作
          </Button>
        )}
        {isFailed && (
          <Button
            size="small"
            danger
            icon={<ReloadOutlined />}
            onClick={(e) => handleRetry(e, work._id)}
          >
            重试
          </Button>
        )}
        <Dropdown
          menu={{
            items: [
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: '删除',
                danger: true,
                onClick: (e) => handleDelete(e as any, work._id),
              },
              isArchived
                ? {
                    key: 'restore',
                    icon: <ArchiveOutlined />,
                    label: '恢复',
                    onClick: (e) => handleRestore(e as any, work._id),
                  }
                : {
                    key: 'archive',
                    icon: <ArchiveOutlined />,
                    label: '归档',
                    onClick: (e) => handleArchive(e as any, work._id),
                  },
            ],
          }}
          trigger={['click']}
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>
      </div>
    )

    return (
      <div
        key={work._id}
        className={`${styles.workCard} ${isArchived ? styles.workCardArchived : ''}`}
        onClick={() => handleWorkClick(work._id)}
      >
        <div className={styles.cardThumb}>
          {work.finalImageUrl ? (
            <img src={work.finalImageUrl} alt={work.title} className={styles.cardImage} />
          ) : (
            <div className={styles.cardPlaceholder}>
              {isFailed
                ? '生成失败'
                : isInProgress
                  ? '创作中...'
                  : isAwaiting
                    ? '待确认'
                    : '暂无预览'}
            </div>
          )}
          <Tag color={statusInfo?.color || 'default'} className={styles.cardStatus}>
            {statusInfo?.text}
          </Tag>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardTitle}>{work.title}</div>
          <div className={styles.cardDate}>{formatDate(work.updatedAt)}</div>
        </div>
        {cardActions}
      </div>
    )
  }

  /* ============================
      渲染列表模式
   ============================ */
  const renderListItem = (work: WorkData) => {
    const statusInfo = WORK_STATUS_MAP[work.status]
    return (
      <div key={work._id} className={styles.listItem} onClick={() => handleWorkClick(work._id)}>
        <div className={styles.listThumb}>
          {work.finalImageUrl ? (
            <img src={work.finalImageUrl} alt={work.title} />
          ) : (
            <div className={styles.cardPlaceholder} style={{ height: '100%' }}>
              -
            </div>
          )}
        </div>
        <div className={styles.listInfo}>
          <div className={styles.listTitle}>{work.title}</div>
          <div className={styles.listMeta}>
            <Tag color={statusInfo?.color}>{statusInfo?.text}</Tag>
            <span className={styles.listDate}>{formatDate(work.updatedAt)}</span>
          </div>
        </div>
        <div className={styles.listActions} onClick={(e) => e.stopPropagation()}>
          {work.status === 'completed' && (
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={(e) => handleDownload(e, work._id)}
            >
              下载
            </Button>
          )}
          {work.status === 'failed' && (
            <Button
              size="small"
              danger
              icon={<ReloadOutlined />}
              onClick={(e) => handleRetry(e, work._id)}
            >
              重试
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* 页面头 */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>作品空间</h1>
      </div>

      {/* 筛选栏 */}
      <div className={styles.filterBar}>
        <div className={styles.filterTabs}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.filterTab} ${
                activeFilter === tab.key ? styles.filterTabActive : ''
              }`}
              onClick={() => setActiveFilter(tab.key)}
            >
              <span>{tab.label}</span>
              <span className={styles.filterTabCount}>({workCounts[tab.key] ?? 0})</span>
            </button>
          ))}
        </div>

        <div className={styles.filterRight}>
          <Input
            placeholder="搜索作品名称或需求"
            prefix={<SearchOutlined />}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className={styles.searchInput}
          />
          <div className={styles.viewToggle}>
            <Button
              type={viewMode === 'grid' ? 'primary' : 'default'}
              size="small"
              icon={<AppstoreOutlined />}
              onClick={() => setViewMode('grid')}
            />
            <Button
              type={viewMode === 'list' ? 'primary' : 'default'}
              size="small"
              icon={<UnorderedListOutlined />}
              onClick={() => setViewMode('list')}
            />
          </div>
        </div>
      </div>

      {/* 作品列表 */}
      {loading ? (
        <div className={styles.loadingText}>加载中...</div>
      ) : filteredWorks.length === 0 ? (
        <div className={styles.emptyState}>
          <Empty
            description={
              activeFilter === 'all' && !keyword
                ? '还没有作品，去首页生成一张吧'
                : '没有找到匹配的作品'
            }
          />
        </div>
      ) : viewMode === 'grid' ? (
        <div className={styles.workGrid}>{filteredWorks.map(renderWorkCard)}</div>
      ) : (
        <div className={styles.workList}>{filteredWorks.map(renderListItem)}</div>
      )}
    </div>
  )
}

// ============================
// 工具函数
// ============================

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** Mock 数据 */
function getMockWorks(): WorkData[] {
  return [
    {
      _id: 'w1',
      title: '夏季促销主视觉',
      status: 'completed',
      source: '为夏季 8 月促销活动设计主视觉 Banner',
      spaceType: 'team',
      spaceName: '设计部',
      knowledgeBases: [{ id: 'kb1', name: '品牌规范 v2.0' }],
      rules: [{ id: 'r1', name: '设计规范', version: 'v1.2' }],
      selectedConcept: '方案 B',
      finalPrompt: 'A vibrant summer promotional banner with ...',
      layoutConfig: {
        texts: [
          { id: 't1', content: '夏日狂欢季', fontSize: 48 },
          { id: 't2', content: '全场 5 折起', fontSize: 32 },
          { id: 't3', content: '8.1-8.31', fontSize: 24 },
        ],
      },
      finalImageUrl: 'https://picsum.photos/seed/work1/600/400',
      candidateImages: [
        { id: 'c1', imageUrl: 'https://picsum.photos/seed/c1/300/200', score: 85 },
        { id: 'c2', imageUrl: 'https://picsum.photos/seed/c2/300/200', score: 72 },
        { id: 'c3', imageUrl: 'https://picsum.photos/seed/c3/300/200', score: 68 },
        { id: 'c4', imageUrl: 'https://picsum.photos/seed/c4/300/200', score: 0, isRetry: true },
      ],
      qualityReport: {
        overallScore: 85,
        dimensions: [
          { name: '品牌一致性', score: 90, comment: '色彩和字体符合规范' },
          { name: '视觉冲击力', score: 88 },
          { name: '信息传达', score: 80 },
          { name: '排版布局', score: 82 },
        ],
      },
      versions: [
        {
          id: 'v3',
          workId: 'w1',
          version: 3,
          title: '最终版',
          imageUrl: 'https://picsum.photos/seed/w1v3/600/400',
          createdAt: '2026-08-01T14:00:00Z',
        },
        {
          id: 'v2',
          workId: 'w1',
          version: 2,
          title: '排版修改',
          imageUrl: 'https://picsum.photos/seed/w1v2/600/400',
          createdAt: '2026-08-01T13:00:00Z',
        },
        {
          id: 'v1',
          workId: 'w1',
          version: 1,
          title: '候选图',
          imageUrl: 'https://picsum.photos/seed/w1v1/600/400',
          createdAt: '2026-08-01T12:00:00Z',
        },
      ],
      isArchived: false,
      createdBy: 'user_1',
      createdByName: '张三',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T14:00:00Z',
    },
    {
      _id: 'w2',
      title: '品牌 Logo 设计',
      status: 'in_progress',
      source: '优化现有品牌 Logo',
      spaceType: 'personal',
      knowledgeBases: [{ id: 'kb1', name: '品牌规范 v2.0' }],
      rules: [],
      candidateImages: [],
      versions: [],
      isArchived: false,
      createdBy: 'user_3',
      createdByName: '王五',
      createdAt: '2026-08-03T09:00:00Z',
      updatedAt: '2026-08-04T10:30:00Z',
    },
    {
      _id: 'w3',
      title: '产品详情页 Banner',
      status: 'awaiting_review',
      source: '产品详情页首图设计',
      spaceType: 'team',
      spaceName: '设计部',
      knowledgeBases: [{ id: 'kb2', name: '产品规范' }],
      rules: [{ id: 'r1', name: '设计规范', version: 'v1.2' }],
      finalImageUrl: 'https://picsum.photos/seed/work3/600/400',
      candidateImages: [
        { id: 'c1', imageUrl: 'https://picsum.photos/seed/w3c1/300/200', score: 92 },
        { id: 'c2', imageUrl: 'https://picsum.photos/seed/w3c2/300/200', score: 78 },
      ],
      versions: [],
      isArchived: false,
      createdBy: 'user_2',
      createdByName: '李四',
      createdAt: '2026-08-04T08:00:00Z',
      updatedAt: '2026-08-04T11:00:00Z',
    },
    {
      _id: 'w4',
      title: '社交媒体素材',
      status: 'failed',
      source: 'Q3 社交媒体素材包',
      spaceType: 'enterprise',
      spaceName: 'XX 科技',
      knowledgeBases: [],
      rules: [],
      candidateImages: [],
      versions: [],
      isArchived: false,
      createdBy: 'user_4',
      createdByName: '赵六',
      createdAt: '2026-08-02T15:00:00Z',
      updatedAt: '2026-08-02T16:00:00Z',
    },
    {
      _id: 'w5',
      title: '年度品牌手册封面',
      status: 'completed',
      source: '更新年度品牌手册封面',
      spaceType: 'enterprise',
      spaceName: 'XX 科技',
      knowledgeBases: [{ id: 'kb1', name: '品牌规范 v2.0' }],
      rules: [{ id: 'r1', name: '设计规范', version: 'v1.2' }],
      finalImageUrl: 'https://picsum.photos/seed/work5/600/400',
      candidateImages: [
        { id: 'c1', imageUrl: 'https://picsum.photos/seed/w5c1/300/200', score: 88 },
        { id: 'c2', imageUrl: 'https://picsum.photos/seed/w5c2/300/200', score: 75 },
      ],
      versions: [],
      isArchived: true,
      archiveExpiresAt: '2026-09-05T00:00:00Z',
      createdBy: 'user_1',
      createdByName: '张三',
      createdAt: '2026-07-20T10:00:00Z',
      updatedAt: '2026-07-25T18:00:00Z',
    },
  ]
}

export default Works
