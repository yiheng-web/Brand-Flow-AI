import { useEffect, useMemo } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { useLocation } from 'react-router-dom'
import { message } from 'antd'

import { getWorkflowStatus, rerunWorkflow, streamWorkflow } from '@/api/workflow'
import { StatusBadge } from '@/components/StatusBadge'
import { useFlowStore } from '@/store/useFlowStore'

import { CanvasPreview } from './components/CanvasPreview'
import { ContextualPanel } from './components/ContextualPanel'
import { FlowView } from './components/FlowView'
import { FLOW_NODES } from './workspace.const'
import styles from './WorkspacePage.module.css'

const formNodeIds = new Set(['intent', 'brand-kb', 'prompt', 'image-gen'])

export function WorkspacePage() {
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const workflowId = useFlowStore((state) => state.workflowId)
  const activeNodeId = useFlowStore((state) => state.activeNodeId)
  const nodeStates = useFlowStore((state) => state.nodeStates)
  const nodeResults = useFlowStore((state) => state.nodeResults)
  const sessionContext = useFlowStore((state) => state.sessionContext)
  const setWorkflow = useFlowStore((state) => state.setWorkflow)
  const setActiveNode = useFlowStore((state) => state.setActiveNode)
  const setNodeStatus = useFlowStore((state) => state.setNodeStatus)
  const applyServerState = useFlowStore((state) => state.applyServerState)
  const appendStreamMessage = useFlowStore((state) => state.appendStreamMessage)

  const currentWorkflowId = workflowId ?? searchParams.get('workflowId')
  const rightPanelIsCanvas = !formNodeIds.has(activeNodeId)

  useEffect(() => {
    const idFromQuery = searchParams.get('workflowId')
    if (idFromQuery && idFromQuery !== workflowId) {
      setWorkflow(idFromQuery)
    }
  }, [searchParams, setWorkflow, workflowId])

  useEffect(() => {
    if (!currentWorkflowId || currentWorkflowId.startsWith('local-')) return undefined

    let stopped = false
    void getWorkflowStatus(currentWorkflowId)
      .then((res) => {
        if (!stopped) applyServerState(res.data)
      })
      .catch(() => appendStreamMessage('状态查询失败，继续使用本地工作流。'))

    const closeStream = streamWorkflow(currentWorkflowId, {
      onEvent: (event) => {
        appendStreamMessage(event.type)
        if (event.nodeId && event.type === 'node_started') {
          setActiveNode(event.nodeId)
          setNodeStatus(event.nodeId, 'RUNNING')
        }
        if (event.nodeId && event.type === 'node_completed') {
          setNodeStatus(event.nodeId, 'SUCCESS')
        }
        if (event.nodeId && event.type === 'node_failed') {
          setNodeStatus(event.nodeId, 'FAILED')
        }
        if (event.data) applyServerState(event.data)
      },
      onError: () => appendStreamMessage('流式连接已断开。'),
    })

    return () => {
      stopped = true
      closeStream()
    }
  }, [appendStreamMessage, applyServerState, currentWorkflowId, setActiveNode, setNodeStatus])

  const handleApproveRerun = async () => {
    const targetRetryNode = nodeResults.eval?.targetRetryNode ?? 'prompt'
    setActiveNode(targetRetryNode)
    if (!currentWorkflowId || currentWorkflowId.startsWith('local-')) {
      message.info('已回到 Prompt 节点，可在本地继续调整。')
      return
    }

    try {
      const res = await rerunWorkflow(currentWorkflowId, {
        rerunFromNodeId: targetRetryNode,
        sessionContext,
      })
      applyServerState(res.data)
      message.success('已触发 AI 回溯重构。')
    } catch {
      message.error('回溯重跑失败')
    }
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.topBar}>
        <div className={styles.projectName}>瑞幸夏日海报_节点流</div>
        <div className={styles.steps}>
          {FLOW_NODES.map((node) => (
            <button
              key={node.id}
              className={`${styles.stepPill} ${activeNodeId === node.id ? styles.stepPillActive : ''}`}
              type="button"
              onClick={() => setActiveNode(node.id)}
            >
              {node.step}. {node.title}
            </button>
          ))}
        </div>
        <div className={styles.status}>
          <StatusBadge status={nodeStates[activeNodeId]} />
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.canvasArea}>
          <ReactFlowProvider>
            <FlowView />
          </ReactFlowProvider>
        </section>
        <section className={styles.right}>
          {rightPanelIsCanvas ? (
            <CanvasPreview
              evaluationReport={nodeResults.eval}
              layers={nodeResults.compose?.layers}
              showEvaluation={activeNodeId === 'eval'}
              onApproveRerun={() => void handleApproveRerun()}
              onSaveKnowledge={() => message.success('已保存到知识库')}
            />
          ) : (
            <ContextualPanel />
          )}
        </section>
      </div>
    </div>
  )
}
