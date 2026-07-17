import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Modal, Space, Tag, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { deleteWork, getWorks, type WorkData } from '@/api/works'
import { EmptyState, ErrorState, LoadingState } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'

export default function WorksPage() {
  const navigate = useNavigate()
  const spaceId = useUserStore((state) => state.currentSpaceId) || 'personal'
  const [works, setWorks] = useState<WorkData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setWorks(await getWorks(spaceId))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法加载作品')
    } finally {
      setLoading(false)
    }
  }, [spaceId])
  useEffect(() => {
    let active = true
    getWorks(spaceId)
      .then((data) => {
        if (active) {
          setWorks(data)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法加载作品')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [spaceId])
  if (loading) return <LoadingState label="正在加载作品…" />
  if (error) return <ErrorState message={error} onRetry={load} />
  return (
    <div style={{ padding: 32 }}>
      <h1>作品中心</h1>
      <p>查看已保存成片、质检结果与版本。</p>
      {works.length === 0 ? (
        <EmptyState
          description="还没有保存作品"
          action={<Button onClick={() => navigate('/home')}>开始创作</Button>}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))',
            gap: 20,
          }}
        >
          {works.map((work) => (
            <Card key={work._id} cover={<img src={work.finalImageUrl} alt={work.title} />}>
              <Card.Meta
                title={work.title}
                description={
                  work.createdAt ? new Date(work.createdAt).toLocaleString() : '时间未知'
                }
              />
              <Space style={{ marginTop: 16 }}>
                {work.qualityReport && <Tag color="blue">质检 {work.qualityReport.totalScore}</Tag>}
                <Button onClick={() => navigate(`/works/${work._id}`)}>详情</Button>
                <Button
                  danger
                  onClick={() =>
                    Modal.confirm({
                      title: `删除“${work.title}”？`,
                      content: '作品及版本记录将被删除。',
                      okButtonProps: { danger: true },
                      onOk: async () => {
                        await deleteWork(work._id)
                        message.success('作品已删除')
                        await load()
                      },
                    })
                  }
                >
                  删除
                </Button>
              </Space>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
