import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FullscreenOutlined,
  MinusOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Background,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { IconButton } from '@/design-system/components'
import { colorTokens } from '@/design-system/tokens'

import {
  FLOW_NODES,
  type FlowNodeId,
  type LayoutDir,
  type NodeExecStatus,
} from '../workspace.const'
import FlowNode from './FlowNode'
import styles from './FlowView.module.css'

const nodeTypes = { flowNode: FlowNode }
const NODE_WIDTH = 248
const NODE_HEIGHT = 182
const NODE_GAP = 56

function buildNodes(
  direction: LayoutDir,
  execStatuses?: Record<FlowNodeId, NodeExecStatus>,
): Node[] {
  return FLOW_NODES.map((node, index) => ({
    id: node.id,
    type: 'flowNode',
    position:
      direction === 'vertical'
        ? { x: 56, y: index * (NODE_HEIGHT + NODE_GAP) + 40 }
        : { x: index * (NODE_WIDTH + NODE_GAP) + 40, y: 72 },
    data: {
      ...node,
      layoutDir: direction,
      execStatus: execStatuses?.[node.id] ?? node.execStatus,
    },
  }))
}

function buildEdges(execStatuses?: Record<FlowNodeId, NodeExecStatus>): Edge[] {
  return FLOW_NODES.slice(0, -1).map((node, index) => {
    const status = execStatuses?.[node.id] ?? node.execStatus
    const isRunningPath = status === 'running'
    const isFailedPath = status === 'failed'
    const color = isFailedPath
      ? colorTokens.error
      : isRunningPath
        ? colorTokens.primary
        : colorTokens.border

    return {
      id: `e-${node.id}-${FLOW_NODES[index + 1].id}`,
      source: node.id,
      target: FLOW_NODES[index + 1].id,
      type: 'smoothstep',
      animated: isRunningPath,
      style: { stroke: color, strokeWidth: isRunningPath || isFailedPath ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  })
}

interface FlowViewProps {
  onNodeClick?: (nodeId: string) => void
  nodeExecStatuses?: Record<FlowNodeId, NodeExecStatus>
}

const FlowView = ({ onNodeClick, nodeExecStatuses }: FlowViewProps) => {
  const [layoutDir, setLayoutDir] = useState<LayoutDir>('horizontal')
  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes('horizontal', nodeExecStatuses))
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges(nodeExecStatuses))
  const [showMiniMap, setShowMiniMap] = useState(true)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  const toggleLayout = useCallback(() => {
    setLayoutDir((previous) => {
      const next = previous === 'vertical' ? 'horizontal' : 'vertical'
      setNodes(buildNodes(next, nodeExecStatuses))
      window.requestAnimationFrame(() => fitView({ padding: 0.22, duration: 240 }))
      return next
    })
  }, [fitView, nodeExecStatuses, setNodes])

  useEffect(() => {
    if (!nodeExecStatuses) return
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          execStatus: nodeExecStatuses[node.id as FlowNodeId] ?? node.data.execStatus,
        },
      })),
    )
    setEdges(buildEdges(nodeExecStatuses))
  }, [nodeExecStatuses, setEdges, setNodes])

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => [
        ...currentEdges,
        {
          ...connection,
          type: 'smoothstep',
          animated: false,
          style: { stroke: colorTokens.border, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: colorTokens.border },
        } as Edge,
      ])
    },
    [setEdges],
  )

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => onNodeClick?.(node.id),
    [onNodeClick],
  )

  const toolbarLabel = useMemo(
    () => (layoutDir === 'vertical' ? '切换为横向布局' : '切换为纵向布局'),
    [layoutDir],
  )

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar} aria-label="画布工具栏">
        <IconButton
          label="放大画布"
          icon={<PlusOutlined />}
          onClick={() => zoomIn()}
          size="small"
        />
        <IconButton
          label="缩小画布"
          icon={<MinusOutlined />}
          onClick={() => zoomOut()}
          size="small"
        />
        <IconButton
          label="适应全部节点"
          icon={<FullscreenOutlined />}
          onClick={() => fitView({ padding: 0.22, duration: 240 })}
          size="small"
        />
        <span className={styles.divider} />
        <IconButton
          label={toolbarLabel}
          icon={layoutDir === 'vertical' ? <ColumnWidthOutlined /> : <ColumnHeightOutlined />}
          onClick={toggleLayout}
          size="small"
        />
        <IconButton
          label={showMiniMap ? '隐藏缩略图' : '显示缩略图'}
          icon={showMiniMap ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={() => setShowMiniMap((visible) => !visible)}
          size="small"
        />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
      >
        <Background color={colorTokens.border} gap={24} size={1} />
        {showMiniMap && (
          <MiniMap
            ariaLabel="工作流缩略图"
            nodeStrokeColor={colorTokens.primary}
            nodeColor={colorTokens.primaryContainer}
            nodeBorderRadius={12}
            maskColor="rgba(95, 99, 104, 0.08)"
            className={styles.miniMap}
          />
        )}
      </ReactFlow>
    </div>
  )
}

export default FlowView
