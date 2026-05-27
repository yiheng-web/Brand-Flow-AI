import { useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'

import type { NodeStatus, WorkflowNodeId } from '@brand-flow/common'

import { useFlowStore } from '@/store/useFlowStore'

import { FLOW_EDGES, FLOW_NODES } from '../workspace.const'
import { FlowNode } from './FlowNode'

import '../react-flow.css'

const nodeTypes = { flowNode: FlowNode }

const statusLabels: Record<NodeStatus, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  SUCCESS: '已完成',
  FAILED: '需处理',
}

export function FlowView() {
  const activeNodeId = useFlowStore((state) => state.activeNodeId)
  const nodeStates = useFlowStore((state) => state.nodeStates)
  const setActiveNode = useFlowStore((state) => state.setActiveNode)

  const nodes = useMemo<Node[]>(
    () =>
      FLOW_NODES.map((node) => ({
        id: node.id,
        type: 'flowNode',
        position: { x: node.x, y: node.y },
        data: {
          ...node,
          active: activeNodeId === node.id,
          statusLabel: statusLabels[nodeStates[node.id]],
        },
      })),
    [activeNodeId, nodeStates],
  )

  const edges = useMemo<Edge[]>(
    () =>
      FLOW_EDGES.map(([source, target]) => ({
        id: `${source}-${target}`,
        source,
        target,
        animated: nodeStates[target as WorkflowNodeId] === 'RUNNING',
        type: 'smoothstep',
      })),
    [nodeStates],
  )

  return (
    <ReactFlow
      fitView
      edges={edges}
      nodeTypes={nodeTypes}
      nodes={nodes}
      onNodeClick={(_, node) => setActiveNode(node.id as WorkflowNodeId)}
    >
      <Background gap={24} size={1} />
      <MiniMap pannable zoomable />
      <Controls />
    </ReactFlow>
  )
}
