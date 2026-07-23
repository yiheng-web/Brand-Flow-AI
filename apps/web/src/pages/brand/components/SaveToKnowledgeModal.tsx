import { useState } from 'react'
import { Modal, message } from 'antd'

interface SaveToKnowledgeModalProps {
  open: boolean
  onClose: () => void
  assetId: string | null
  assetName: string
}

const SaveToKnowledgeModal = ({ open, onClose, assetId, assetName }: SaveToKnowledgeModalProps) => {
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!assetId) return

    setLoading(true)
    try {
      // TODO: POST /api/assets/{id}/save-to-knowledge
      console.log('保存资产到知识库:', { assetId, assetName })
      await new Promise((resolve) => setTimeout(resolve, 800))
      message.success(`「${assetName}」已保存到知识库`)
      onClose()
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="保存到知识库"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={loading}
      okText="确认保存"
      cancelText="取消"
      destroyOnClose
    >
      <p style={{ margin: 0, lineHeight: 1.6, color: '#333' }}>
        确认将资产「<strong>{assetName}</strong>」保存为知识库知识项吗？
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#999' }}>
        保存后可在知识库中引用该素材。
      </p>
    </Modal>
  )
}

export default SaveToKnowledgeModal
