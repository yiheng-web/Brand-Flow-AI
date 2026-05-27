import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { useLocation, useNavigate } from 'react-router-dom'
import { message } from 'antd'

import type { WorkflowNodeId } from '@brand-flow/common'

import { getWorkflowStatus, rerunWorkflow, streamWorkflow, submitPrompt } from '@/api/workflow'
import { extractStreamError } from '@/api/workflowStream'
import { useFlowStore } from '@/store/useFlowStore'

import { CanvasPreview } from './components/CanvasPreview'
import { ContextualPanel } from './components/ContextualPanel'
import { FlowView } from './components/FlowView'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { SaveToKnowledgeModal } from './components/modals/SaveToKnowledgeModal'
import { ViewPromptModal } from './components/modals/ViewPromptModal'
import { copyImageUrl, downloadImage } from './components/modals/imageActions'
import { WorkflowSuccessModal } from './components/modals/WorkflowSuccessModal'
import { WorkflowFailureModal } from './components/modals/WorkflowFailureModal'
import { truncateText } from './workspace.labels'
import styles from './WorkspacePage.module.css'

const formNodeIds = new Set(['intent', 'brand-kb', 'prompt', 'image-gen'])

export function WorkspacePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])

  const workflowId = useFlowStore((state) => state.workflowId)
  const prompt = useFlowStore((state) => state.prompt)
  const activeNodeId = useFlowStore((state) => state.activeNodeId)
  const nodeResults = useFlowStore((state) => state.nodeResults)
  const sessionContext = useFlowStore((state) => state.sessionContext)
  const workflowStatus = useFlowStore((state) => state.workflowStatus)
  const errorMessage = useFlowStore((state) => state.errorMessage)
  const streamMessages = useFlowStore((state) => state.streamMessages)

  const setWorkflow = useFlowStore((state) => state.setWorkflow)
  const setActiveNode = useFlowStore((state) => state.setActiveNode)
  const setNodeStatus = useFlowStore((state) => state.setNodeStatus)
  const setWorkflowStatus = useFlowStore((state) => state.setWorkflowStatus)
  const applyServerState = useFlowStore((state) => state.applyServerState)
  const appendStreamMessage = useFlowStore((state) => state.appendStreamMessage)

  const [failedNodeId, setFailedNodeId] = useState<WorkflowNodeId | undefined>()
  const [failureOpen, setFailureOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [saveKbOpen, setSaveKbOpen] = useState(false)
  const [promptModalOpen, setPromptModalOpen] = useState(false)

  const currentWorkflowId = workflowId ?? searchParams.get('workflowId')
  const rightPanelIsCanvas = !formNodeIds.has(activeNodeId)

  const resultImageUrl =
    nodeResults.compose?.finalImageUrl ?? nodeResults['image-gen']?.baseImageUrl

  const openFailure = useCallback(
    (nodeId?: WorkflowNodeId, msg?: string) => {
      setFailedNodeId(nodeId)
      if (msg) setWorkflowStatus('failed', msg)
      setFailureOpen(true)
    },
    [setWorkflowStatus],
  )

  const openSuccess = useCallback(() => {
    if (workflowStatus !== 'failed') {
      setSuccessOpen(true)
    }
  }, [workflowStatus])

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
        if (stopped) return
        applyServerState(res.data)
        setWorkflowStatus(res.data.status, res.data.errorMessage ?? null)
        if (res.data.status === 'failed') {
          openFailure(res.data.activeNodeId, res.data.errorMessage)
        }
        if (res.data.status === 'completed') {
          openSuccess()
        }
      })
      .catch(() => appendStreamMessage('状态查询失败，继续使用本地工作流。'))

    const closeStream = streamWorkflow(currentWorkflowId, {
      onEvent: (event) => {
        appendStreamMessage(event.type)
        const events = [event]

        for (const ev of events) {
          if (ev.nodeId && ev.type === 'node_started') {
            setActiveNode(ev.nodeId)
            setNodeStatus(ev.nodeId, 'RUNNING')
            setWorkflowStatus('running')
          }
          if (ev.nodeId && ev.type === 'node_completed') {
            setNodeStatus(ev.nodeId, 'SUCCESS')
          }
          if (ev.nodeId && ev.type === 'node_failed') {
            setNodeStatus(ev.nodeId, 'FAILED')
            openFailure(ev.nodeId, extractStreamError(ev))
          }
          if (ev.type === 'failed') {
            setWorkflowStatus('failed', extractStreamError(ev))
            openFailure(ev.nodeId, extractStreamError(ev))
          }
          if (ev.type === 'completed' || ev.type === 'workflow_completed') {
            setWorkflowStatus('completed')
            if (ev.data) applyServerState(ev.data)
            openSuccess()
          }
          if (ev.data) applyServerState(ev.data)
        }
      },
      onError: (_err, reason) => {
        if (reason) appendStreamMessage(reason)
        if (workflowStatus !== 'completed') {
          openFailure(activeNodeId, reason)
        }
      },
    })

    return () => {
      stopped = true
      closeStream()
    }
  }, [
    activeNodeId,
    appendStreamMessage,
    applyServerState,
    currentWorkflowId,
    openFailure,
    openSuccess,
    setActiveNode,
    setNodeStatus,
    setWorkflowStatus,
    workflowStatus,
  ])

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
      setWorkflowStatus(res.data.status, res.data.errorMessage ?? null)
      message.success('已触发 AI 回溯重构。')
    } catch {
      message.error('回溯重跑失败')
    }
  }

  const handleRegenerate = async () => {
    if (!prompt.trim()) {
      message.warning('缺少原始创意，请返回首页重新输入')
      return
    }
    try {
      const res = await submitPrompt({
        prompt,
        spaceId: sessionContext.spaceId ?? 'personal',
        scope: sessionContext.scope,
        sceneType: sessionContext.sceneType,
        imageRatio: sessionContext.imageRatio,
        useKnowledge: sessionContext.useKnowledge,
      })
      setWorkflow(res.data.id, prompt)
      navigate(`/workspace?workflowId=${res.data.id}`)
      message.success('已重新提交生成任务')
    } catch {
      message.error('重新生成失败')
    }
  }

  const taskTitle = truncateText(prompt || '未命名任务', 32)

  return (
    <div className={styles.wrapper}>
      <WorkspaceHeader
        workflowId={currentWorkflowId}
        onRegenerate={() => void handleRegenerate()}
        onViewPrompt={() => setPromptModalOpen(true)}
      />

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
              finalImageUrl={nodeResults.compose?.finalImageUrl}
              layers={nodeResults.compose?.layers}
              showEvaluation={activeNodeId === 'eval'}
              onApproveRerun={() => void handleApproveRerun()}
              onSaveKnowledge={() => setSaveKbOpen(true)}
            />
          ) : (
            <ContextualPanel />
          )}
        </section>
      </div>

      <ViewPromptModal
        negativePrompt={nodeResults.prompt?.negativePrompt ?? sessionContext.negativePrompt}
        open={promptModalOpen}
        positivePrompt={nodeResults.prompt?.positivePrompt ?? sessionContext.positivePrompt}
        prompt={prompt}
        onClose={() => setPromptModalOpen(false)}
      />

      <WorkflowFailureModal
        errorMessage={errorMessage ?? undefined}
        failedNodeId={failedNodeId}
        open={failureOpen}
        streamMessages={streamMessages}
        onClose={() => setFailureOpen(false)}
        onGoHome={() => navigate('/home')}
        onRetry={() => {
          setFailureOpen(false)
          void handleRegenerate()
        }}
      />

      <WorkflowSuccessModal
        imageUrl={resultImageUrl}
        open={successOpen}
        positivePrompt={nodeResults.prompt?.positivePrompt}
        prompt={prompt}
        score={nodeResults.eval?.score}
        onClose={() => setSuccessOpen(false)}
        onCopyLink={() => {
          if (resultImageUrl) void copyImageUrl(resultImageUrl)
        }}
        onDownload={() => {
          if (resultImageUrl) downloadImage(resultImageUrl)
        }}
        onRegenerate={() => {
          setSuccessOpen(false)
          void handleRegenerate()
        }}
        onSaveKnowledge={() => {
          setSuccessOpen(false)
          setSaveKbOpen(true)
        }}
      />

      <SaveToKnowledgeModal
        defaultImageUrl={resultImageUrl ?? ''}
        defaultTags={sessionContext.tags ?? nodeResults.intent?.tags ?? []}
        defaultTitle={taskTitle}
        open={saveKbOpen}
        onCancel={() => setSaveKbOpen(false)}
        onSuccess={() => {
          setSaveKbOpen(false)
          message.success('已保存到品牌档案')
        }}
      />
    </div>
  )
}
