import { memo } from 'react'
import {
  AuditOutlined,
  BulbOutlined,
  CompassOutlined,
  DatabaseOutlined,
  FileImageOutlined,
  FontSizeOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import { Handle, Position, type NodeProps } from 'reactflow'

import { StatusBadge, type SemanticStatus } from '@/design-system/components'

import type { FlowNodeDefinition, FlowNodeId, LayoutDir, NodeExecStatus } from '../workspace.const'
import styles from './FlowNode.module.css'

type FlowNodeData = FlowNodeDefinition & { label?: string; layoutDir?: LayoutDir }

const NODE_ICONS: Record<FlowNodeId, React.ReactNode> = {
  brief: <BulbOutlined />,
  brandConstraint: <DatabaseOutlined />,
  creativeDirection: <CompassOutlined />,
  prompt: <FontSizeOutlined />,
  generate: <PictureOutlined />,
  compose: <FileImageOutlined />,
  finalEvaluation: <AuditOutlined />,
}

const STATUS_MAP: Record<NodeExecStatus, SemanticStatus> = {
  unconfigured: 'unconfigured',
  ready: 'ready',
  pending: 'queued',
  queued: 'queued',
  running: 'running',
  done: 'success',
  warning: 'warning',
  failed: 'failed',
  skipped: 'skipped',
  stale: 'warning',
}

const FlowNode = memo(({ data, selected }: NodeProps<FlowNodeData>) => {
  const semanticStatus = STATUS_MAP[data.execStatus] ?? 'unconfigured'
  const isHorizontal = data.layoutDir === 'horizontal'

  return (
    <article
      className={`${styles.node} ${styles[semanticStatus]} ${selected ? styles.selected : ''}`}
      aria-label={`${data.title}，${data.subtitle}`}
    >
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {NODE_ICONS[data.id]}
        </span>
        <span className={styles.step}>步骤 {data.step}</span>
        <StatusBadge status={semanticStatus} />
      </header>
      <div className={styles.body}>
        <h3 className={styles.title}>{data.title}</h3>
        <p className={styles.description}>{data.subtitle}</p>
      </div>
      <footer className={styles.footer}>
        <span>输入</span>
        <span aria-hidden="true">→</span>
        <span>输出摘要</span>
      </footer>
      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        className={styles.handle}
      />
      <Handle
        type="source"
        position={isHorizontal ? Position.Right : Position.Bottom}
        className={styles.handle}
      />
    </article>
  )
})

FlowNode.displayName = 'FlowNode'

export default FlowNode
