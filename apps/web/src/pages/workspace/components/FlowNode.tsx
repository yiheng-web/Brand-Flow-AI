import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'

import type { FlowNodeDefinition } from '../workspace.const'

interface FlowNodeData extends FlowNodeDefinition {
  active: boolean
  statusLabel: string
}

export function FlowNode({ data }: NodeProps<FlowNodeData>) {
  return (
    <div className={`flow-node ${data.active ? 'flow-node-active' : ''}`}>
      <Handle className="flow-node-handle" position={Position.Left} type="target" />
      <div className="flow-node-body">
        <div className="flow-node-title">
          <span>{data.icon}</span>
          {data.step}. {data.title}
        </div>
        <div className="flow-node-sub">{data.subtitle}</div>
        <div className="flow-node-status">{data.statusLabel}</div>
      </div>
      <Handle className="flow-node-handle" position={Position.Right} type="source" />
    </div>
  )
}
