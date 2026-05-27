import { Modal } from 'antd'

interface ViewPromptModalProps {
  open: boolean
  prompt: string
  positivePrompt?: string
  negativePrompt?: string
  onClose: () => void
}

export function ViewPromptModal({
  open,
  prompt,
  positivePrompt,
  negativePrompt,
  onClose,
}: ViewPromptModalProps) {
  return (
    <Modal footer={null} open={open} title="原始 Prompt" width={560} onCancel={onClose}>
      <p>
        <strong>用户创意：</strong>
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
        {prompt || '暂无'}
      </pre>
      <p>
        <strong>正向 Prompt：</strong>
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
        {positivePrompt || '等待 Prompt 专家节点生成'}
      </pre>
      <p>
        <strong>负向 Prompt：</strong>
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
        {negativePrompt || '等待 Prompt 专家节点生成'}
      </pre>
    </Modal>
  )
}
