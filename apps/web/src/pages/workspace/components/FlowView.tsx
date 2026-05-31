import { useCallback, useState, useEffect } from 'react'
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
import { FLOW_NODES, type LayoutDir } from '../workspace.const'

const nodeTypes = { flowNode: FlowNode }

const NODE_W = 200
const NODE_H = 130
const GAP = 48

function buildNodes(dir: LayoutDir): Node[] {
  return FLOW_NODES.map((node, index) => ({
    id: node.id,
    type: 'flowNode',
    position:
      dir === 'vertical'
        ? { x: 40, y: index * (NODE_H + GAP) + 20 }
        : { x: index * (NODE_W + GAP) + 20, y: 40 },
    data: { ...node, layoutDir: dir },
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
  progressData: Record<string, unknown> | null
  workflowStatus: string
  onNodeClick?: (nodeId: string) => void
}

const FlowView = ({ progressData, workflowStatus, onNodeClick }: FlowViewProps) => {
  const [layoutDir, setLayoutDir] = useState<LayoutDir>('vertical')
  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes('vertical'))
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges())
  const [showMiniMap, setShowMiniMap] = useState(true)

  const toggleLayout = useCallback(() => {
    setLayoutDir((prev) => {
      const next = prev === 'vertical' ? 'horizontal' : 'vertical'
      // 保持当前节点状态
      setNodes(nds => buildNodes(next).map((n, i) => ({
        ...n,
        data: { ...n.data, execStatus: nds[i]?.data.execStatus || 'pending' }
      })))
      return next
    })
  }, [setNodes])

  // 监听后端进度动态更新节点状态
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        let execStatus = n.data.execStatus
        const flowId = n.id
        const order = ['intent', 'brand-kb', 'prompt', 'image-gen', 'compose', 'eval']
        const myIndex = order.indexOf(flowId)

        if (workflowStatus === 'completed') {
          execStatus = 'done'
        } else if (workflowStatus === 'running' || workflowStatus === 'failed') {
          const agentNodes = progressData ? Object.keys(progressData) : []
          const doneAgentNodes = new Set(agentNodes)
          
          let currentFlowIndex = 0 // 默认第一个节点正在运行
          if (doneAgentNodes.has('intentNode')) currentFlowIndex = 1
          if (doneAgentNodes.has('knowledgeNode')) currentFlowIndex = 2
          if (doneAgentNodes.has('promptNode')) currentFlowIndex = 3
          if (doneAgentNodes.has('generateNode')) currentFlowIndex = 5 // 后端没有 compose 节点，生成完直接跳到 eval
          if (doneAgentNodes.has('evaluateNode')) currentFlowIndex = 6

          if (myIndex < currentFlowIndex) {
            execStatus = 'done'
          } else if (myIndex === currentFlowIndex) {
            execStatus = workflowStatus === 'failed' ? 'pending' : 'running'
          } else {
            execStatus = 'pending'
          }
        }
        
        return {
          ...n,
          data: { ...n.data, execStatus },
        }
      })
    )
  }, [progressData, workflowStatus, setNodes])

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

  const onNodeClickCb = useCallback((_: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      onNodeClick(node.id)
    }
  }, [onNodeClick])

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
        key={layoutDir}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClickCb}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
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