import { useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import FlowNode from './FlowNode'
import { FLOW_NODES, type FlowNodeId, type LayoutDir, type NodeExecStatus } from '../workspace.const'

const nodeTypes = { flowNode: FlowNode }

const NODE_W = 200
const NODE_H = 130
const GAP = 48

function buildNodes(dir: LayoutDir, execStatuses?: Record<FlowNodeId, NodeExecStatus>): Node[] {
  return FLOW_NODES.map((node, index) => ({
    id: node.id,
    type: 'flowNode',
    position:
      dir === 'vertical'
        ? { x: 40, y: index * (NODE_H + GAP) + 20 }
        : { x: index * (NODE_W + GAP) + 20, y: 40 },
    data: {
      ...node,
      layoutDir: dir,
      execStatus: execStatuses?.[node.id as FlowNodeId] ?? node.execStatus,
    },
  }))
}

function buildEdges(): Edge[] {
  const edges: Edge[] = []
  for (let i = 0; i < FLOW_NODES.length - 1; i++) {
    edges.push({
      id: `e-${FLOW_NODES[i].id}-${FLOW_NODES[i + 1].id}`,
      source: FLOW_NODES[i].id,
      target: FLOW_NODES[i + 1].id,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#4f6ff7', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#4f6ff7' },
    })
  }
  return edges
}

interface FlowViewProps {
  onNodeClick?: (nodeId: string) => void
  /** 从工作流生命周期传入的每个节点执行状态 */
  nodeExecStatuses?: Record<FlowNodeId, NodeExecStatus>
}

const FlowView = ({ onNodeClick, nodeExecStatuses }: FlowViewProps) => {
  const [layoutDir, setLayoutDir] = useState<LayoutDir>('vertical')
  const [nodes, setNodes, onNodesChange] = useNodesState(
    buildNodes('vertical', nodeExecStatuses)
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges())
  const [showMiniMap, setShowMiniMap] = useState(true)

  const toggleLayout = useCallback(() => {
    setLayoutDir((prev) => {
      const next = prev === 'vertical' ? 'horizontal' : 'vertical'
      setNodes(buildNodes(next, nodeExecStatuses))
      return next
    })
  }, [setNodes, nodeExecStatuses])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => [
        ...eds,
        {
          ...connection,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#4f6ff7', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#4f6ff7' },
        } as Edge,
      ])
    },
    [setEdges]
  )

  const key = layoutDir

  return (
    <div className="flow-view-wrapper" style={{ position: 'relative' }}>
      <button
        onClick={toggleLayout}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          background: '#fff',
          border: '1px solid #d7dce5',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          color: '#555b66',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
        }}
      >
        {layoutDir === 'vertical' ? '⇄ 横向' : '⇅ 纵向'}
      </button>
      <ReactFlow
        key={key}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        onNodeClick={(_event, node) => {
          onNodeClick?.(node.id)
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag
        zoomOnScroll
      >
        <Background color="#d7dadc" gap={24} />
        <Controls showInteractive={false} />
        {showMiniMap && (
          <MiniMap
            nodeStrokeColor="#4f6ff7"
            nodeColor="#eef3fb"
            nodeBorderRadius={8}
            maskColor="rgba(0,0,0,0.08)"
            style={{ borderRadius: 12, overflow: 'hidden' }}
          />
        )}
      </ReactFlow>
      <button
        onClick={() => setShowMiniMap((v) => !v)}
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 10,
          background: '#fff',
          border: '1px solid #d7dce5',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 12,
          color: '#555b66',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          lineHeight: 1.4,
        }}
      >
        {showMiniMap ? '🗺 收起' : '🗺 展开'}
      </button>
    </div>
  )
}

export default FlowView