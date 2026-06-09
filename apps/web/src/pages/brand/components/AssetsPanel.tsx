import { useState, useEffect } from 'react'
import { Button, Card, Empty, Space, Tag, Image, message, Spin } from 'antd'
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
  image: { icon: <PictureOutlined />, color: '#1677ff' },
  document: { icon: <FileOutlined />, color: '#52c41a' },
  video: { icon: <VideoCameraOutlined />, color: '#722ed1' },
  other: { icon: <QuestionCircleOutlined />, color: '#999' },
}

const TYPE_LABELS: Record<string, string> = {
  image: '图片',
  document: '文档',
  video: '视频',
  other: '其他',
}

const AssetsPanel = () => {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)

  /* 弹窗状态 */
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null)

  /** 加载资产列表 */
  const fetchAssets = async () => {
    setLoading(true)
    try {
      // TODO: GET /api/assets
      console.log('获取资产列表')
      // const res = await api.getAssets()
      // setAssets(res.data || [])

      // 模拟空数据
      await new Promise((resolve) => setTimeout(resolve, 300))
      setAssets([])
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  /** 删除资产 */
  const handleDelete = (asset: AssetItem) => {
    // TODO: DELETE /api/assets/{id}
    console.log('删除资产:', asset.id)
    // const res = await api.deleteAsset(asset.id)
    message.success(`已删除「${asset.name}」`)
    setAssets((prev) => prev.filter((a) => a.id !== asset.id))
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
      <Card
        key={asset.id}
        className="asset-card"
        hoverable
        styles={{
          body: { padding: 16 },
        }}
      >
        {/* 缩略图 */}
        <div
          style={{
            width: '100%',
            height: 140,
            background: '#f5f5f5',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            overflow: 'hidden',
          }}
        >
          {asset.type === 'image' && asset.thumbnailUrl ? (
            <Image
              src={asset.thumbnailUrl}
              alt={asset.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              preview={{ mask: null }}
            />
          ) : (
            <span style={{ fontSize: 36, color: typeCfg.color }}>{typeCfg.icon}</span>
          )}
        </div>

        {/* 信息 */}
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              lineHeight: '20px',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={asset.name}
          >
            {asset.name}
          </div>
          <Space size={4}>
            <Tag color={typeCfg.color} style={{ margin: 0, fontSize: 11 }}>
              {TYPE_LABELS[asset.type] || asset.type}
            </Tag>
            {sizeStr && <span style={{ fontSize: 12, color: '#999' }}>{sizeStr}</span>}
          </Space>
        </div>

        {/* 操作按钮 */}
        <Space>
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
    <div>
      {/* 顶栏：标题 + 操作按钮 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>素材资产</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            创建
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
            上传
          </Button>
        </Space>
      </div>

      {/* 资产列表 */}
      <Spin spinning={loading}>
        {assets.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {assets.map(renderAssetCard)}
          </div>
        ) : (
          <Empty description="暂无素材资产" style={{ marginTop: 60 }}>
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
          </Empty>
        )}
      </Spin>

      {/* 弹窗 */}
      <CreateAssetModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
      <AssetUploadModal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
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
