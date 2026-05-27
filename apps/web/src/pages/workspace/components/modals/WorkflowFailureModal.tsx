import { Button, Collapse, Modal } from 'antd'

import type { WorkflowNodeId } from '@brand-flow/common'

import { NODE_LABELS } from '../../workspace.labels'

interface WorkflowFailureModalProps {
  open: boolean
  failedNodeId?: WorkflowNodeId
  errorMessage?: string
  streamMessages: string[]
  onRetry: () => void
  onGoHome: () => void
  onClose: () => void
}

export function WorkflowFailureModal({
  open,
  failedNodeId,
  errorMessage,
  streamMessages,
  onRetry,
  onGoHome,
  onClose,
}: WorkflowFailureModalProps) {
  const nodeLabel = failedNodeId ? NODE_LABELS[failedNodeId] : '未知节点'

  return (
    <Modal
      footer={[
        <Button key="home" onClick={onGoHome}>
          返回首页
        </Button>,
        <Button key="retry" type="primary" onClick={onRetry}>
          重新生成
        </Button>,
      ]}
      open={open}
      title="生成失败"
      onCancel={onClose}
    >
      <p>
        <strong>失败节点：</strong>
        {nodeLabel}
      </p>
      <p>
        <strong>错误原因：</strong>
        {errorMessage || '未知错误，请查看下方日志'}
      </p>
      <p>
        <strong>建议操作：</strong>
      </p>
      <ol>
        <li>检查 apps/api/.env 中 OPENAI_API_KEY / OPENAI_BASE_URL</li>
        <li>检查 Redis / MongoDB 是否启动</li>
        <li>若使用 Pollinations，检查图片 URL 是否可访问</li>
        <li>点击「重新生成」或返回首页调整后重试</li>
      </ol>
      <Collapse
        items={[
          {
            key: 'logs',
            label: '查看日志',
            children: (
              <pre style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                {streamMessages.length > 0 ? streamMessages.join('\n') : '暂无流式日志'}
              </pre>
            ),
          },
        ]}
      />
    </Modal>
  )
}
