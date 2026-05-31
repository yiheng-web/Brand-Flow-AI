import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import { message } from 'antd'
import { SwitchTabs } from '../../components/SwitchTabs'
import {
  DEFAULT_TAGS,
  WORKSPACE_VIEW_TABS,
  type FlowNodeId,
  type NodeExecStatus,
} from './workspace.const'
import FlowView from './components/FlowView'
import SaveKnowledgeModal from './components/SaveKnowledgeModal'
import IntentPanel from './components/IntentPanel'
import BrandKbPanel from './components/BrandKbPanel'
import PromptExpertPanel from './components/PromptExpertPanel'
import ImageGenPanel from './components/ImageGenPanel'
import ComposePanel from './components/ComposePanel'
import EvalPanel from './components/EvalPanel'
import styles from './workspace.module.css'
import {
  submitPrompt,
  type AgentState,
  type IntentOutput,
  type PromptChainOutput,
  type GenerateResult,
  type EvaluationResult,
} from '../../api/workflow'
import { createAuthEventSource } from '../../utils/sse'
import { useWorkflowStore } from '@/store/useWorkflowStore'

const NODE_ID_TO_GRAPH_KEY: Record<FlowNodeId, string> = {
  intent: 'intentNode',
  'brand-kb': 'knowledgeNode',
  prompt: 'promptNode',
  'image-gen': 'generateNode',
  compose: 'composeNode',
  eval: 'evaluateNode',
}

const NODE_ORDER: FlowNodeId[] = [
  'intent',
  'brand-kb',
  'prompt',
  'image-gen',
  'compose',
  'eval',
]

const NODE_LABELS: Record<FlowNodeId, string> = {
  intent: '意图解析',
  'brand-kb': '知识库匹配',
  prompt: 'Prompt专家',
  'image-gen': '图像生成',
  compose: '排版合成',
  eval: '自我评估',
}

const Workspace = () => {
  const location = useLocation()
  const navState = location.state as { prompt?: string; workflowId?: string } | null

  /* ---- 视图 / 节点选择 ---- */
  const [viewTabIndex, setViewTabIndex] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<FlowNodeId | null>(null)

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId as FlowNodeId)
  }

  const selectedNodeLabel = selectedNodeId ? NODE_LABELS[selectedNodeId] : null

  /* ---- 标签 / 保存知识库弹窗 ---- */
  const [tags, setTags] = useState<string[]>([...DEFAULT_TAGS])
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  /* ===== 工作流生命周期：从 store 读取 ===== */
  const {
    workflowId,
    status: workflowStatus,
    prompt: storedPrompt,
    imageUrl: baseImageUrl,
    setWorkflowId,
    setStatus: setWorkflowStatus,
    setPrompt: setStoredPrompt,
    setAgentState,
    setError: setWorkflowError,
    setNodeExecStatuses,
    setNodeStreamData,
    nodeExecStatuses,
    nodeStreamData,
  } = useWorkflowStore()

  // 合并 navState 的 prompt 和 store 的 prompt
  const userPrompt = navState?.prompt || storedPrompt

  /** 是否正在启动工作流（提交中） */
  const [isSubmitting, setIsSubmitting] = useState(false)

  /* ---- 引用：SSE 连接 ---- */
  const eventSourceRef = useRef<{ close: () => void } | null>(null)
  const nodeStreamDataRef = useRef<Record<string, Record<string, unknown>>>({})

  /* ============================
      SSE 流式连接
   ============================ */
  const connectStream = useCallback((id: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const url = `/api/workflow/${id}/stream`

    const conn = createAuthEventSource(url, {
      onMessage: (event) => {
        if (event.type === 'connected') return

        if (event.type === 'progress' && event.data) {
          const data = event.data as Record<string, unknown>
          const nodeKey = Object.keys(data)[0]
          if (!nodeKey) return

          const nodeValue = data[nodeKey] as Record<string, unknown>

          setNodeStreamData((prev) => {
            const updated = { ...prev, [nodeKey]: nodeValue }
            nodeStreamDataRef.current = updated
            return updated
          })

          const currentNodeId = Object.entries(NODE_ID_TO_GRAPH_KEY).find(
            ([, v]) => v === nodeKey
          )?.[0] as FlowNodeId | undefined

          if (currentNodeId) {
            const currentIdx = NODE_ORDER.indexOf(currentNodeId)
            setNodeExecStatuses((prev) => {
              const next: Record<FlowNodeId, NodeExecStatus> = {
                ...prev,
                [currentNodeId]: 'done',
              }
              const nextIdx = currentIdx + 1
              if (nextIdx < NODE_ORDER.length) {
                next[NODE_ORDER[nextIdx]] = 'running'
              }
              return next
            })
          }
          return
        }

        if (event.type === 'completed' && event.data) {
          const finalState = event.data as AgentState

          setWorkflowStatus('completed')

          if (finalState) {
            nodeStreamDataRef.current = {}
            NODE_ORDER.forEach((nodeId) => {
              const graphKey = NODE_ID_TO_GRAPH_KEY[nodeId]
              const val = (finalState as unknown as Record<string, unknown>)[graphKey] || null
              if (val) {
                nodeStreamDataRef.current[graphKey] = val as Record<string, unknown>
              }
            })
            setNodeStreamData({ ...nodeStreamDataRef.current })
            setAgentState(finalState)
          }

          setNodeExecStatuses({
            intent: 'done',
            'brand-kb': 'done',
            prompt: 'done',
            'image-gen': 'done',
            compose: 'done',
            eval: 'done',
          })

          conn.close()
          eventSourceRef.current = null
          return
        }

        if (event.type === 'failed') {
          setWorkflowError(event.error || '工作流执行失败')
          setWorkflowStatus('failed')
          conn.close()
          eventSourceRef.current = null
        }
      },
      onError: () => {
        // SSE 连接错误处理
      },
    })

    eventSourceRef.current = conn
  }, [setNodeStreamData, setNodeExecStatuses, setWorkflowStatus, setAgentState, setWorkflowError])

  /* ============================
      工作流启动
   ============================ */
  const startWorkflow = useCallback(async () => {
    if (!userPrompt?.trim()) return
    setIsSubmitting(true)
    setWorkflowError(null)
    setWorkflowStatus('pending')
    setStoredPrompt(userPrompt)
    setNodeExecStatuses({
      intent: 'pending',
      'brand-kb': 'pending',
      prompt: 'pending',
      'image-gen': 'pending',
      compose: 'pending',
      eval: 'pending',
    })
    setNodeStreamData({})
    nodeStreamDataRef.current = {}

    try {
      const res = await submitPrompt({
        prompt: userPrompt,
        spaceId: 'personal',
      })
      const id: string = (res as { data?: { id?: string }; id?: string }).data?.id || (res as { data?: { id?: string }; id?: string }).id || ''
      if (!id) throw new Error('创建工作流后未返回 ID')

      setWorkflowId(id)
      setWorkflowStatus('running')
      setIsSubmitting(false)

      setNodeExecStatuses((prev) => ({ ...prev, intent: 'running' }))

      connectStream(id)
    } catch (err) {
      setWorkflowStatus('failed')
      setWorkflowError(
        err instanceof Error ? err.message : '提交创意失败，请重试'
      )
      setIsSubmitting(false)
    }
  }, [userPrompt, setStoredPrompt, setWorkflowId, setWorkflowError, setWorkflowStatus, setNodeExecStatuses, setNodeStreamData, connectStream])

  /* ---- 自动启动工作流 / 断线重连 ---- */
  useEffect(() => {
    // 场景 1: 从首页带来了全新的 workflowId
    if (navState?.workflowId && navState.workflowId !== workflowId) {
      setWorkflowId(navState.workflowId)
      // 重置上一次可能处于 completed 的状态
      setWorkflowStatus('running')
      setNodeExecStatuses({
        intent: 'running',
        'brand-kb': 'pending',
        prompt: 'pending',
        'image-gen': 'pending',
        compose: 'pending',
        eval: 'pending',
      })
      setNodeStreamData({})
      if (nodeStreamDataRef.current) {
        nodeStreamDataRef.current = {}
      }
      
      connectStream(navState.workflowId)
    } 
    // 场景 2: 仅带来了 prompt，没有 workflowId (直接启动)
    else if (navState?.prompt && workflowStatus === 'idle' && !workflowId) {
      startWorkflow()
    }
    // 场景 3: 页面刷新，已存在 workflowId，且处于运行中，但 SSE 连接已断开，则重新连接
    else if (workflowId && (workflowStatus === 'running' || workflowStatus === 'pending') && !eventSourceRef.current) {
      connectStream(workflowId)
    }
  }, [navState, workflowId, workflowStatus, setWorkflowId, setWorkflowStatus, setNodeExecStatuses, setNodeStreamData, connectStream, startWorkflow])

  /* ---- 清理 ---- */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  /* ---- derived state ---- */
  const isExecuting = workflowStatus === 'running' || isSubmitting
  
  const generateResult = nodeStreamData['generateNode'] as GenerateResult | undefined
  const evaluationResult = nodeStreamData['evaluateNode'] as EvaluationResult | undefined

  const isImageGenExecuting = (nodeExecStatuses['image-gen'] !== 'done' && isExecuting) || !baseImageUrl

  const handleSaveImage = () => {
    if (!baseImageUrl) return
    const a = document.createElement('a')
    a.href = baseImageUrl
    a.download = `poster_${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    message.success('图片已开始下载')
  }

  const renderRightContent = () => {
    if (!selectedNodeId) {
      return (
        <div className={styles.emptyPanel}>
          <p>请点击左侧节点查看属性</p>
        </div>
      )
    }

    switch (selectedNodeId) {
      case 'intent':
        const intentData = nodeStreamData['intentNode'] as { intentResult?: IntentOutput } | IntentOutput | undefined
        const intentRes = (intentData && 'intentResult' in intentData ? intentData.intentResult : intentData) as IntentOutput | undefined
        return (
          <IntentPanel
            userPrompt={userPrompt}
            intentResult={intentRes || null}
          />
        )
      case 'brand-kb':
        const kbData = nodeStreamData['knowledgeNode'] as { knowledgeContext?: string } | undefined
        return (
          <BrandKbPanel
            knowledgeContext={kbData?.knowledgeContext || null}
            onReRun={() => console.log('重新运行知识匹配')}
          />
        )
      case 'prompt':
        const promptData = nodeStreamData['promptNode'] as PromptChainOutput | undefined
        return (
          <PromptExpertPanel
            userPrompt={userPrompt}
            promptResult={promptData || null}
          />
        )
      case 'image-gen':
        return (
          <ImageGenPanel
            selectedModel="flux"
            isExecuting={isImageGenExecuting}
            baseImageUrl={baseImageUrl}
            genParams={generateResult ? undefined : undefined}
            onReRun={() => console.log('重新运行图像生成节点')}
          />
        )
      case 'compose':
        return (
          <ComposePanel
            isComposing={isExecuting && !generateResult}
            finalImageUrl={baseImageUrl}
            onSwitchToPreview={() => setViewTabIndex(1)}
            onReRun={() => console.log('重新运行排版合成节点')}
          />
        )
      case 'eval':
        return (
          <EvalPanel
            evaluationResult={evaluationResult || null}
            isEvaluating={isExecuting}
            onReRun={() => console.log('重新运行评估节点')}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <span className={styles.topBarTitle}>{userPrompt || '新工作流'}</span>
        <SwitchTabs
          items={WORKSPACE_VIEW_TABS}
          defaultIndex={viewTabIndex}
          onChange={(i) => setViewTabIndex(i)}
        />
        <div className={styles.statusIndicator}>
          {workflowStatus === 'running' && <div className={styles.spinner} />}
          <span>{workflowStatus === 'completed' ? '已完成' : workflowStatus === 'failed' ? '已失败' : '运行中'}</span>
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.center}>
          {viewTabIndex === 0 ? (
            <div className={styles.canvasArea}>
              <ReactFlowProvider>
                <FlowView nodeExecStatuses={nodeExecStatuses} onNodeClick={handleNodeClick} />
              </ReactFlowProvider>
            </div>
          ) : (
            <div className={styles.previewArea}>
              <div className={styles.previewToolbar}>
                <div className={styles.previewToolGroup}>
                  {baseImageUrl && (
                    <button
                      type="button"
                      className={styles.saveImageBtn}
                      onClick={handleSaveImage}
                    >
                      保存图片
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.previewCanvas}>
                {baseImageUrl ? (
                  <img
                    className={styles.previewImage}
                    src={baseImageUrl}
                    alt="生成海报"
                    onClick={() => setIsLightboxOpen(true)}
                  />
                ) : (
                  <span style={{ color: '#b0b7c7', fontSize: 14, fontWeight: 500 }}>
                    {isExecuting ? '正在生成...' : '海报预览区域'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 图片放大灯箱 */}
          {isLightboxOpen && baseImageUrl && (
            <div
              className={styles.imageLightbox}
              onClick={() => setIsLightboxOpen(false)}
            >
              <button
                className={styles.lightboxClose}
                onClick={() => setIsLightboxOpen(false)}
              >
                ×
              </button>
              <img
                src={baseImageUrl}
                alt="生成海报"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </section>

        <aside className={styles.right}>
          <div className={styles.rightHeader}>
            <span className={styles.panelTitle}>
              {selectedNodeLabel
                ? `节点属性：${selectedNodeLabel}`
                : '节点属性'}
            </span>
          </div>
          {renderRightContent()}
        </aside>
      </div>

      <SaveKnowledgeModal
        visible={isSaveModalVisible}
        tags={tags}
        onTagsChange={setTags}
        groupOptions={[]}
        selectedGroupKey=""
        onClose={() => setIsSaveModalVisible(false)}
        onSave={() => {
          message.info('功能开发中，敬请期待')
        }}
      />
    </div>
  )
}

export default Workspace