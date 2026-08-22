import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Space, Tag, Image, message } from 'antd'
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  SaveOutlined,
  PictureOutlined,
  FileOutlined,
  VideoCameraOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import CreateAssetModal from './CreateAssetModal'
import AssetUploadModal from './AssetUploadModal'
import SaveToKnowledgeModal from './SaveToKnowledgeModal'
import { deleteAsset, getAssets, type AssetData } from '@/api/assets'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'
import { EmptyState, ErrorState, LoadingState } from '@/design-system/components'
import type { AssetFilter } from '..'
import styles from './AssetsPanel.module.css'

/** 资产对象结构（与后端约定） */
interface AssetItem {
  id: string
  name: string
  type: 'image' | 'document' | 'video' | 'other'
  description?: string
  url?: string
  thumbnailUrl?: string
  fileSize?: number
  createdAt: string
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  image: { icon: <PictureOutlined />, color: 'var(--color-primary)' },
  document: { icon: <FileOutlined />, color: 'var(--color-success)' },
  video: { icon: <VideoCameraOutlined />, color: 'var(--color-accent-purple)' },
  other: { icon: <QuestionCircleOutlined />, color: 'var(--color-text-tertiary)' },
}

const TYPE_LABELS: Record<string, string> = {
  image: '图片',
  document: '文档',
  video: '视频',
  other: '其他',
}

const AssetsPanel = ({ filter }: { filter: AssetFilter }) => {
  const userId = useAuthStore((state) => state.user?.id)
  const currentSpaceId = useUserStore((state) => state.currentSpaceId)
  const currentSpaceType = useUserStore((state) => state.currentSpaceType)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* 弹窗状态 */
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null)
  const ownerId = currentSpaceType === 'personal' ? userId || '' : currentSpaceId || ''
  const ownerType = currentSpaceType === 'personal' ? 'user' : currentSpaceType
  const visibility =
    currentSpaceType === 'personal'
      ? 'private'
      : currentSpaceType === 'team'
        ? 'team'
        : 'enterprise'

  /** 加载资产列表 */
  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAssets(currentSpaceId || 'personal')
      setAssets(
        data.map((asset) => ({
          id: asset._id,
          name: asset.name,
          type: ['image', 'document', 'video'].includes(asset.type)
            ? (asset.type as AssetItem['type'])
            : 'other',
          description:
            typeof asset.metadata?.description === 'string'
              ? asset.metadata.description
              : undefined,
          url: (asset as AssetData & { signedUrl?: string }).signedUrl || asset.url,
          thumbnailUrl:
            (asset as AssetData & { thumbnailSignedUrl?: string }).thumbnailSignedUrl ||
            (asset as AssetData & { signedUrl?: string }).signedUrl ||
            asset.url,
          createdAt: asset.createdAt || '',
        })),
      )
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载品牌资产')
      if (err instanceof Error) {
        message.error(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [currentSpaceId])
  const visibleAssets = filter === 'all' ? assets : assets.filter((asset) => asset.type === filter)

  useEffect(() => {
    queueMicrotask(() => void fetchAssets())
  }, [fetchAssets])

  /** 删除资产 */
  const handleDelete = async (asset: AssetItem) => {
    try {
      await deleteAsset(asset.id)
      message.success(`已删除「${asset.name}」`)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
    } catch {
      message.error('删除素材失败')
    }
  }

  /** 保存到知识库 */
  const handleSaveToKnowledge = (asset: AssetItem) => {
    setSelectedAsset(asset)
    setSaveModalOpen(true)
  }

  /** 渲染资产卡片 */
  const renderAssetCard = (asset: AssetItem) => {
    const typeCfg = TYPE_CONFIG[asset.type] || TYPE_CONFIG.other
    const sizeStr = asset.fileSize
      ? asset.fileSize > 1024 * 1024
        ? `${(asset.fileSize / 1024 / 1024).toFixed(1)} MB`
        : `${(asset.fileSize / 1024).toFixed(1)} KB`
      : null

    return (
      <Card key={asset.id} className={styles.assetCard} hoverable>
        <div className={styles.thumbnail}>
          {asset.type === 'image' && asset.thumbnailUrl ? (
            <Image
              src={asset.thumbnailUrl}
              alt={asset.name}
              className={styles.thumbnailImage}
              preview={{ mask: null }}
            />
          ) : (
            <span className={styles.typeIcon} style={{ color: typeCfg.color }}>
              {typeCfg.icon}
            </span>
          )}
        </div>

        <div className={styles.assetInfo}>
          <div className={styles.assetName} title={asset.name}>
            {asset.name}
          </div>
          <Space size={4}>
            <Tag color={typeCfg.color}>{TYPE_LABELS[asset.type] || asset.type}</Tag>
            {sizeStr && <span className={styles.fileSize}>{sizeStr}</span>}
          </Space>
        </div>

        <Space className={styles.cardActions}>
          <Button
            type="link"
            size="small"
            icon={<SaveOutlined />}
            onClick={() => handleSaveToKnowledge(asset)}
          >
            保存到知识库
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(asset)}
          >
            删除
          </Button>
        </Space>
      </Card>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{filter === 'all' ? '全部内容' : TYPE_LABELS[filter]}</h2>
          <p>{visibleAssets.length} 项内容</p>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            创建
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
            上传
          </Button>
        </Space>
      </div>

      {loading ? (
        <LoadingState label="正在加载品牌资产…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void fetchAssets()} />
      ) : visibleAssets.length > 0 ? (
        <div className={styles.assetGrid}>{visibleAssets.map(renderAssetCard)}</div>
      ) : (
        <EmptyState
          description={filter === 'all' ? '当前空间暂无品牌资产' : `暂无${TYPE_LABELS[filter]}`}
          action={
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalOpen(true)}
              >
                创建资产
              </Button>
              <Button icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
                上传素材
              </Button>
            </Space>
          }
        />
      )}

      {/* 弹窗 */}
      <CreateAssetModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        ownerId={ownerId}
        ownerType={ownerType}
        visibility={visibility}
        onSuccess={() => void fetchAssets()}
      />
      <AssetUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        ownerId={ownerId}
        ownerType={ownerType}
        visibility={visibility}
        onSuccess={() => void fetchAssets()}
      />
      <SaveToKnowledgeModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        assetId={selectedAsset?.id || null}
        assetName={selectedAsset?.name || ''}
      />
    </div>
  )
}

export default AssetsPanel
