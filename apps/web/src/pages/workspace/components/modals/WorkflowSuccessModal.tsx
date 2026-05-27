import { Button, Modal } from 'antd'

interface WorkflowSuccessModalProps {
  open: boolean
  imageUrl?: string
  prompt: string
  positivePrompt?: string
  score?: number
  onDownload: () => void
  onCopyLink: () => void
  onSaveKnowledge: () => void
  onRegenerate: () => void
  onClose: () => void
}

export function WorkflowSuccessModal({
  open,
  imageUrl,
  prompt,
  positivePrompt,
  score,
  onDownload,
  onCopyLink,
  onSaveKnowledge,
  onRegenerate,
  onClose,
}: WorkflowSuccessModalProps) {
  return (
    <Modal
      footer={[
        <Button key="copy" onClick={onCopyLink}>
          复制链接
        </Button>,
        <Button key="download" onClick={onDownload}>
          下载图片
        </Button>,
        <Button key="save" type="default" onClick={onSaveKnowledge}>
          保存到知识库
        </Button>,
        <Button key="regen" onClick={onRegenerate}>
          再次生成
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>,
      ]}
      open={open}
      title="生成完成"
      width={640}
      onCancel={onClose}
    >
      {imageUrl ? (
        <img
          alt="生成结果"
          src={imageUrl}
          style={{ width: '100%', maxHeight: 360, objectFit: 'contain', marginBottom: 12 }}
        />
      ) : (
        <p>暂无图片 URL</p>
      )}
      <p>
        <strong>任务描述：</strong>
        {prompt}
      </p>
      {positivePrompt && (
        <p>
          <strong>正向 Prompt：</strong>
          {positivePrompt}
        </p>
      )}
      {score !== undefined && (
        <p>
          <strong>AI 质检评分：</strong>
          {score}
        </p>
      )}
    </Modal>
  )
}