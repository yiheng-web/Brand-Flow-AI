import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { FlowNodeDefinition, LayoutDir } from '../workspace.const'

type FlowNodeData = FlowNodeDefinition & { label?: string; layoutDir?: LayoutDir }

const STATUS_CONFIG: Record<string, { bg: string; border?: string }> = {
  done: { bg: '#22c55e' },
  running: { bg: '#3b82f6', border: '#3b82f6' },
  pending: { bg: '#d1d5db' },
}

const FlowNode = memo(({ data, selected }: NodeProps<FlowNodeData>) => {
  const statusCfg = STATUS_CONFIG[data.execStatus]
  const isRunning = data.execStatus === 'running'
  const isHorizontal = data.layoutDir === 'horizontal'

  const style: React.CSSProperties = {
    ...(isRunning
      ? { borderColor: statusCfg.border, boxShadow: '0 0 0 1px #3b82f6, 0 4px 16px rgba(59,130,246,0.2)' }
      : {}),
    ...(selected
      ? { borderColor: '#4f6ff7', boxShadow: '0 0 0 2px #4f6ff7, 0 4px 16px rgba(79,111,247,0.25)' }
      : {}),
  }

  return (
    <div
      className="flow-node"
      style={style}
    >
      <div className="flow-node-body">
        <div className="flow-node-title">
          <span className="flow-node-emoji">{data.emoji}</span>
          {data.title}
          <span className="flow-node-dot" style={{ background: statusCfg.bg }} />
        </div>
        <div className="flow-node-sub">{data.subtitle}</div>
      </div>
      <Handle type="target" position={isHorizontal ? Position.Left : Position.Top} className="flow-node-handle" />
      <Handle type="source" position={isHorizontal ? Position.Right : Position.Bottom} className="flow-node-handle" />
    </div>
  )
})

FlowNode.displayName = 'FlowNode'

export default FlowNode