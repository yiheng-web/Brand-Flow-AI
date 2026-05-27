import { Button, Space, Tag } from 'antd'
import { HomeOutlined, ReloadOutlined, FileTextOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

import { StatusBadge } from '@/components/StatusBadge'
import { DEFAULT_MODEL_INFO } from '@/config/modelInfo'
import { useFlowStore } from '@/store/useFlowStore'

import { NODE_LABELS, WORKFLOW_STATUS_LABELS, truncateText } from '../workspace.labels'
import styles from '../WorkspacePage.module.css'

interface WorkspaceHeaderProps {
  workflowId: string | null
  onViewPrompt: () => void
  onRegenerate: () => void
}

export function WorkspaceHeader({ workflowId, onViewPrompt, onRegenerate }: WorkspaceHeaderProps) {
  const navigate = useNavigate()
  const prompt = useFlowStore((s) => s.prompt)
  const workflowStatus = useFlowStore((s) => s.workflowStatus)
  const activeNodeId = useFlowStore((s) => s.activeNodeId)
  const nodeStates = useFlowStore((s) => s.nodeStates)
  const sessionContext = useFlowStore((s) => s.sessionContext)

  const shortId = workflowId ? workflowId.slice(-8) : '—'
  const statusLabel = workflowStatus ? WORKFLOW_STATUS_LABELS[workflowStatus] : '本地演示'

  return (
    <header className={styles.topBar}>
      <div className={styles.projectName}>
        <div>{truncateText(prompt || '未命名创作任务', 28)}</div>
        <small style={{ fontWeight: 400, color: '#666' }}>
          #{shortId} · {statusLabel} · {NODE_LABELS[activeNodeId]}
        </small>
      </div>
      <div className={styles.metaTags}>
        <Tag>{sessionContext.imageRatio ?? sessionContext.imageSize ?? '1:1'}</Tag>
        <Tag color={sessionContext.useKnowledge === false ? 'default' : 'blue'}>
          {sessionContext.useKnowledge === false ? '未启用知识库' : '已启用知识库'}
        </Tag>
        <Tag>{sessionContext.modelInfo ?? DEFAULT_MODEL_INFO}</Tag>
      </div>
      <div className={styles.headerActions}>
        <StatusBadge status={nodeStates[activeNodeId]} />
        <Space>
          <Button icon={<HomeOutlined />} onClick={() => navigate('/home')}>
            返回首页
          </Button>
          <Button icon={<ReloadOutlined />} onClick={onRegenerate}>
            重新生成
          </Button>
          <Button icon={<FileTextOutlined />} onClick={onViewPrompt}>
            查看 Prompt
          </Button>
        </Space>
      </div>
    </header>
  )
}
