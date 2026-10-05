import { useCallback, useEffect, useRef, useState } from 'react'
import { DeleteOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Modal, message } from 'antd'
import { useNavigate } from 'react-router-dom'

import { deleteWork, getWorks, type WorkData } from '@/api/works'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'

import styles from './works.module.css'

type WorkFilter = 'all' | 'favorite'

export default function WorksPage() {
  const navigate = useNavigate()
  const spaceId = useUserStore((state) => state.currentSpaceId) || 'personal'
  const canWrite = useUserStore(
    (state) =>
      state.spaces.find((space) => space.id === spaceId)?.permissions?.manageWorks ?? false,
  )
  const spaceName = useUserStore((state) => state.currentSpaceName)
  const requestRef = useRef(0)
  const [loadedSpaceId, setLoadedSpaceId] = useState('')
  const [works, setWorks] = useState<WorkData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<WorkFilter>('all')
  const visibleWorks = filter === 'favorite' ? works.filter((work) => work.isFavorite) : works

  const load = useCallback(async () => {
    if (spaceId !== (useUserStore.getState().currentSpaceId || 'personal')) return
    const request = ++requestRef.current
    setLoading(true)
    try {
      const data = await getWorks(spaceId)
      if (request !== requestRef.current) return
      setWorks(data)
      setError(null)
    } catch (reason) {
      if (request !== requestRef.current) return
      setError(reason instanceof Error ? reason.message : '无法加载作品')
    } finally {
      if (request === requestRef.current) {
        setLoadedSpaceId(spaceId)
        setLoading(false)
      }
    }
  }, [spaceId])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load()
    })
    return () => {
      active = false
      requestRef.current += 1
    }
  }, [load])

  const handleDelete = (work: WorkData) => {
    Modal.confirm({
      title: `删除“${work.title}”？`,
      content: '作品及版本记录将被删除，此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await deleteWork(work._id)
        message.success('作品已删除')
        await load()
      },
    })
  }

  if (loading || loadedSpaceId !== spaceId) return <LoadingState label="正在加载作品…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className={styles.page}>
      <PageHeader
        title="作品空间"
        description={`当前空间：${spaceName} · 通过左侧空间菜单切换个人、团队、企业；未完成创作请前往创作任务`}
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canWrite}
            onClick={() => navigate('/home')}
          >
            新建创作
          </Button>
        }
      />

      <div className={styles.filters} role="tablist" aria-label="作品筛选">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={filter === 'all' ? styles.active : ''}
          onClick={() => setFilter('all')}
        >
          全部作品 {works.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'favorite'}
          className={filter === 'favorite' ? styles.active : ''}
          onClick={() => setFilter('favorite')}
        >
          已收藏 {works.filter((work) => work.isFavorite).length}
        </button>
        <span />
        <small>最近更新 ↓</small>
      </div>

      {visibleWorks.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            description={filter === 'favorite' ? '还没有收藏作品' : '当前空间还没有保存作品'}
            action={
              <Button type="primary" disabled={!canWrite} onClick={() => navigate('/home')}>
                开始创作
              </Button>
            }
          />
        </div>
      ) : (
        <div className={styles.grid}>
          {visibleWorks.map((work) => (
            <article key={work._id} className={styles.card}>
              <button
                type="button"
                className={styles.cover}
                onClick={() => navigate(`/works/${work._id}`)}
              >
                {work.finalImageUrl ? (
                  <img src={work.finalImageUrl} alt={work.title} />
                ) : (
                  <span>暂无预览</span>
                )}
                {work.qualityReport && <em>质检 {work.qualityReport.totalScore.toFixed(1)}</em>}
              </button>
              <div className={styles.cardBody}>
                <div>
                  <h2>{work.title}</h2>
                  {work.creatorId && (
                    <p>
                      创建者：
                      {typeof work.creatorId === 'string'
                        ? work.creatorId
                        : work.creatorId.profile?.name ||
                          work.creatorId.email ||
                          work.creatorId._id}
                    </p>
                  )}
                  <p>
                    {work.createdAt ? new Date(work.createdAt).toLocaleString('zh-CN') : '时间未知'}
                  </p>
                </div>
                <div className={styles.cardActions}>
                  <Button
                    type="text"
                    aria-label={`查看${work.title}`}
                    icon={<EyeOutlined />}
                    onClick={() => navigate(`/works/${work._id}`)}
                  />
                  <Button
                    type="text"
                    danger
                    aria-label={`删除${work.title}`}
                    icon={<DeleteOutlined />}
                    disabled={!canWrite || !(work.canEdit ?? spaceId === 'personal')}
                    onClick={() => handleDelete(work)}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
