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
      <Handle
        className="flow-node-handle"
        id="left-target"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="flow-node-handle"
        id="right-target"
        position={Position.Right}
        type="target"
      />
      <Handle className="flow-node-handle" id="top-target" position={Position.Top} type="target" />
      <div className="flow-node-body">
        <div className="flow-node-title">
          <span>{data.icon}</span>
          {data.step}. {data.title}
        </div>
        <div className="flow-node-sub">{data.subtitle}</div>
        <div className="flow-node-status">{data.statusLabel}</div>
      </div>
      <Handle
        className="flow-node-handle"
        id="right-source"
        position={Position.Right}
        type="source"
      />
      <Handle
        className="flow-node-handle"
        id="left-source"
        position={Position.Left}
        type="source"
      />
      <Handle
        className="flow-node-handle"
        id="bottom-source"
        position={Position.Bottom}
        type="source"
      />
    </div>
  )
}
