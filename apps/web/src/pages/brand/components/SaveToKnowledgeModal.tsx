import { useState } from 'react'
import { useEffect } from 'react'
import { Modal, Select, message } from 'antd'
import { saveAssetToKnowledge } from '@/api/assets'
import { getKnowledgeList, type KnowledgeData } from '@/api/knowledge'
import { useUserStore } from '@/store/useUserStore'

import styles from './SaveToKnowledgeModal.module.css'

interface SaveToKnowledgeModalProps {
  open: boolean
  onClose: () => void
  assetId: string | null
  assetName: string
}

const SaveToKnowledgeModal = ({ open, onClose, assetId, assetName }: SaveToKnowledgeModalProps) => {
  const [loading, setLoading] = useState(false)
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeData[]>([])
  const [knowledgeId, setKnowledgeId] = useState<string>()
  const spaceId = useUserStore((state) => state.currentSpaceId) || 'personal'

  useEffect(() => {
    if (!open) return
    void getKnowledgeList(spaceId)
      .then(setKnowledgeList)
      .catch(() => message.error('知识库列表加载失败'))
  }, [open, spaceId])

  const handleSave = async () => {
    if (!assetId || !knowledgeId) return

    setLoading(true)
    try {
      await saveAssetToKnowledge(assetId, knowledgeId)
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
      <p className={styles.description}>
        确认将资产「<strong>{assetName}</strong>」保存为知识库知识项吗？
      </p>
      <p className={styles.hint}>保存后可在知识库中引用该素材。</p>
      <Select
        className={styles.select}
        placeholder="选择目标知识库"
        value={knowledgeId}
        onChange={setKnowledgeId}
        options={knowledgeList.map((item) => ({ value: item._id, label: item.name }))}
      />
    </Modal>
  )
}

export default SaveToKnowledgeModal
