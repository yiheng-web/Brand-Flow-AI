import { Modal } from 'antd'

interface DeleteKnowledgeModalProps {
  open: boolean
  title: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteKnowledgeModal({
  open,
  title,
  loading,
  onCancel,
  onConfirm,
}: DeleteKnowledgeModalProps) {
  return (
    <Modal
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ danger: true }}
      okText="确认删除"
      open={open}
      title="确认删除该知识？"
      onCancel={onCancel}
      onOk={onConfirm}
    >
      <p>即将删除「{title}」。</p>
      <p>删除后将不会再用于 AI 生成上下文。</p>
    </Modal>
  )
}
