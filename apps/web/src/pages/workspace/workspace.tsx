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
  updateNodeOutput,
  rerunNode,
  type IntentOutput,
  type PromptChainOutput,
  type GenerateResult,
  type EvaluationResult,
  type AgentState,
} from '../../api/workflow'
import { createAuthEventSource } from '../../utils/sse'
import { useWorkflowStore } from '@/store/useWorkflowStore'

/**
 * 节点 ID → Graph 节点名的映射，用于 SSE progress 事件匹配
 */
const NODE_ID_TO_GRAPH_KEY: Record<FlowNodeId, string> = {
  intent: 'intentNode',
  'brand-kb': 'knowledgeNode',
  prompt: 'promptNode',
  'image-gen': 'generateNode',
  compose: 'composeNode',
  eval: 'evaluateNode',
}

const NODE_ORDER: FlowNodeId[] = ['intent', 'brand-kb', 'prompt', 'image-gen', 'compose', 'eval']

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
    imageUrl,
    error: workflowError,
    nodeExecStatuses,
    nodeStreamData,
    setWorkflowId,
    setStatus: setWorkflowStatus,
    setPrompt: setStoredPrompt,
    setAgentState,
    setError: setWorkflowError,
    setNodeExecStatuses,
    setNodeStreamData,
    setImageUrl,
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
  const connectStream = useCallback(
    (id: string) => {
      // 关闭旧的 SSE 连接
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const url = `/api/workflow/${id}/stream`

      const conn = createAuthEventSource(url, {
        onMessage: (event) => {
          if (event.type === 'connected') {
            return
          }

          // 预留：处理大模型节点增量流式输出
          if (event.type === 'node_progress') {
            // 当前预留，后续可根据 delta 拼接字符串并更新 nodeStreamData
            return
          }

          // 处理节点启动事件
          if (event.type === 'node_started') {
            const nodeKey = (event as any).nodeType as string
            const currentNodeId = Object.entries(NODE_ID_TO_GRAPH_KEY).find(
              ([, v]) => v === nodeKey,
            )?.[0] as FlowNodeId | undefined
            if (currentNodeId) {
              setNodeExecStatuses((prev) => ({ ...prev, [currentNodeId]: 'running' }))
            }
            return
          }

          // 处理节点失败事件
          if (event.type === 'node_failed') {
            const nodeKey = (event as any).nodeType as string
            const currentNodeId = Object.entries(NODE_ID_TO_GRAPH_KEY).find(
              ([, v]) => v === nodeKey,
            )?.[0] as FlowNodeId | undefined
            if (currentNodeId) {
              setNodeExecStatuses((prev) => ({ ...prev, [currentNodeId]: 'failed' }))
            }
            return
          }

          // 仅处理新的规范事件 node_completed / node_skipped
          if (event.type === 'node_completed' || event.type === 'node_skipped') {
            let nodeKey = (event as any).nodeType as string
            let nodeValue: Record<string, unknown> = {}
            let isSkipped = false

            if (event.type === 'node_completed' && event.data) {
              nodeValue = event.data
            } else {
              isSkipped = true
            }

            if (!nodeKey) return

            // 更新累积数据（同步到 store）- 忽略被 skip 的情况
            if (!isSkipped) {
              setNodeStreamData((prev) => {
                const updated = { ...prev, [nodeKey]: nodeValue }
                nodeStreamDataRef.current = updated
                return updated
              })
            }

            // 根据节点 key 更新对应 node 的执行状态 & 标记下一个节点
            const currentNodeId = Object.entries(NODE_ID_TO_GRAPH_KEY).find(
              ([, v]) => v === nodeKey,
            )?.[0] as FlowNodeId | undefined

            if (currentNodeId) {
              // ★ 如果是 image-gen 节点完成，立即提取图片 URL 到 store
              if (currentNodeId === 'image-gen' && nodeValue.generateResult) {
                const genResult = nodeValue.generateResult as GenerateResult
                if (genResult.content && typeof genResult.content === 'string') {
                  setImageUrl(genResult.content)
                }
              }

              const currentIdx = NODE_ORDER.indexOf(currentNodeId)
              setNodeExecStatuses((prev) => {
                const next: Record<FlowNodeId, NodeExecStatus> = {
                  ...prev,
                  [currentNodeId]: 'done',
                }
                // 将下一个节点标记为 running
                const nextIdx = currentIdx + 1
                if (nextIdx < NODE_ORDER.length) {
                  next[NODE_ORDER[nextIdx]] = 'running'
                }
                return next
              })
            }
            return
          }

          if (event.type === 'workflow_completed' && event.data) {
            const finalState = event.data as AgentState | undefined

            setWorkflowStatus('completed')

            // 写入最终数据（同步到 store）
            if (finalState) {
              nodeStreamDataRef.current = {}

              // finalState 中的 key 分别是 intentResult, knowledgeContext, promptResult 等
              // 我们需要把它们映射回 nodeStreamData 对应的 nodeKey（如 intentNode, promptNode）
              const mapping: Record<string, string> = {
                intent: 'intentResult',
                'brand-kb': 'knowledgeContext',
                prompt: 'promptResult',
                'image-gen': 'generateResult',
                eval: 'evaluationResult',
              }

              NODE_ORDER.forEach((nodeId) => {
                const graphKey = NODE_ID_TO_GRAPH_KEY[nodeId]
                const stateKey = mapping[nodeId]
                if (stateKey) {
                  const val = (finalState as any)[stateKey]
                  if (val) {
                    // 为了与 node_completed 流输出的数据结构保持一致，包装一层
                    nodeStreamDataRef.current[graphKey] = { [stateKey]: val } as Record<
                      string,
                      unknown
                    >
                  }
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

          if (event.type === 'workflow_failed' && event.error) {
            setWorkflowStatus('failed')
            setWorkflowError(event.error)
            return
          }
        },
        onError: () => {
          // SSE 连接错误处理
        },
      })

      eventSourceRef.current = conn
    },
    [
      setNodeStreamData,
      setNodeExecStatuses,
      setWorkflowStatus,
      setAgentState,
      setWorkflowError,
      setImageUrl,
    ],
  )

  /* ============================
      工作流启动
   ============================ */
  const startWorkflow = useCallback(async () => {
    if (!userPrompt?.trim()) return
    setIsSubmitting(true)
    setWorkflowError(null)
    setWorkflowStatus('pending')
    setStoredPrompt(userPrompt) // 同步到 store
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
      const id: string =
        (res as { data?: { id?: string }; id?: string }).data?.id ||
        (res as { data?: { id?: string }; id?: string }).id ||
        ''
      if (!id) throw new Error('创建工作流后未返回 ID')

      setWorkflowId(id) // 同步到 store
      setWorkflowStatus('running')
      setIsSubmitting(false)

      // 标记第一个节点为 running
      setNodeExecStatuses((prev) => ({ ...prev, intent: 'running' }))

      // 仅启动 SSE
      connectStream(id)
    } catch (err) {
      setWorkflowStatus('failed')
      setWorkflowError(err instanceof Error ? err.message : '提交创意失败，请重试')
      setIsSubmitting(false)
    }
  }, [
    userPrompt,
    setStoredPrompt,
    setWorkflowId,
    setWorkflowError,
    setWorkflowStatus,
    setNodeExecStatuses,
    setNodeStreamData,
    connectStream,
  ])

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
    else if (
      workflowId &&
      (workflowStatus === 'running' || workflowStatus === 'pending') &&
      !eventSourceRef.current
    ) {
      connectStream(workflowId)
    }
  }, [
    navState,
    workflowId,
    workflowStatus,
    setWorkflowId,
    setWorkflowStatus,
    setNodeExecStatuses,
    setNodeStreamData,
    connectStream,
    startWorkflow,
  ])

  /* ---- 清理 ---- */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  /* ============================
      从 SSE 累积数据中提取各面板所需数据
   ============================ */

  /** 获取意图解析数据 */
  const getIntentData = (): {
    keywords?: string[]
    sceneType?: string
    intentResult?: IntentOutput
  } | null => {
    const intentData = nodeStreamData['intentNode'] as { intentResult?: IntentOutput } | undefined
    if (!intentData?.intentResult) return null
    return {
      intentResult: intentData.intentResult,
      keywords: intentData.intentResult.intent ? [intentData.intentResult.intent] : undefined,
      sceneType: intentData.intentResult.intent || undefined,
    }
  }

  /** 获取知识库匹配数据 */
  const getKnowledgeData = (): string | null => {
    const kbData = nodeStreamData['knowledgeNode'] as { knowledgeContext?: string } | undefined
    if (!kbData) return null
    return kbData.knowledgeContext || null
  }

  /** 获取 Prompt 专家数据 */
  const getPromptData = (): PromptChainOutput | null => {
    const promptData = nodeStreamData['promptNode'] as
      | { promptResult?: PromptChainOutput }
      | undefined
    if (!promptData) return null
    return promptData.promptResult || (promptData as any)
  }

  /** 获取生成结果（图片 URL） */
  const getGenerateData = (): GenerateResult | null => {
    const genData = nodeStreamData['generateNode'] as
      | { generateResult?: GenerateResult }
      | undefined
    if (!genData) return null
    return genData.generateResult || (genData as any)
  }

  /** 获取评估结果 */
  const getEvalData = (): EvaluationResult | null => {
    const evalData = nodeStreamData['evaluateNode'] as
      | { evaluationResult?: EvaluationResult }
      | undefined
    if (!evalData) return null
    return evalData.evaluationResult || (evalData as any)
  }

  /* ---- derived state ---- */
  const isExecuting = workflowStatus === 'running' || isSubmitting
  const generateResult = getGenerateData()
  const baseImageUrl = imageUrl
  const evaluationResult = getEvalData()

  // 图像生成节点专用：只有节点状态不是 done 且 workflow 还在运行时才显示 loading
  const isImageGenExecuting =
    (nodeExecStatuses['image-gen'] !== 'done' && isExecuting) || !baseImageUrl

  const statusLabel = (() => {
    if (isSubmitting) return '提交中…'
    if (workflowStatus === 'pending') return '排队中'
    if (workflowStatus === 'running') return '运行中'
    if (workflowStatus === 'completed') return '已完成'
    if (workflowStatus === 'failed') return '失败'
    return '等待开始'
  })()

  const handleSaveImage = async () => {
    const url = imageUrl || baseImageUrl
    if (!url) return
    try {
      // 尝试 fetch 下载（可能会被 CORS 拦截）
      const response = await fetch(url, { mode: 'cors' })
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `brand-flow-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
      message.success('图片已保存')
    } catch {
      // CORS 拦截时，在新标签页打开图片让用户右键保存
      message.info('已在新标签页打开图片，请右键保存')
      window.open(url, '_blank')
    }
  }

  /* ============================
      节点互动：保存修改 / 触发重跑
   ============================ */
  const handleSaveNode = async (nodeId: FlowNodeId, payload: Record<string, unknown>) => {
    if (!workflowId) return
    try {
      const graphKey = NODE_ID_TO_GRAPH_KEY[nodeId]
      await updateNodeOutput(workflowId, graphKey, payload)

      // 更新本地状态，使其生效，并将下游节点设为 stale (这里简化处理，直接让 SSE 处理后续更新)
      setNodeStreamData((prev) => {
        const updated = { ...prev, [graphKey]: payload }
        nodeStreamDataRef.current = updated
        return updated
      })

      // 级联将下游节点设为 stale/pending，同时清理其遗留数据
      const currentIdx = NODE_ORDER.indexOf(nodeId)
      if (currentIdx !== -1 && currentIdx < NODE_ORDER.length - 1) {
        setNodeExecStatuses((prev) => {
          const next = { ...prev }
          for (let i = currentIdx + 1; i < NODE_ORDER.length; i++) {
            next[NODE_ORDER[i]] = 'pending'
          }
          return next
        })
        setNodeStreamData((prev) => {
          const nextData = { ...prev }
          for (let i = currentIdx + 1; i < NODE_ORDER.length; i++) {
            const downKey = NODE_ID_TO_GRAPH_KEY[NODE_ORDER[i]]
            delete nextData[downKey]
          }
          nodeStreamDataRef.current = nextData
          return nextData
        })
      }
      message.success('修改已保存，下游节点状态已更新')
    } catch (err) {
      message.error('保存修改失败')
    }
  }

  const handleRerunNode = async (nodeId: FlowNodeId) => {
    if (!workflowId) return
    try {
      const graphKey = NODE_ID_TO_GRAPH_KEY[nodeId]
      await rerunNode(workflowId, graphKey)
      message.info('正在触发接力执行...')

      // 开启流
      if (workflowStatus !== 'running') {
        setWorkflowStatus('running')
        if (!eventSourceRef.current) {
          connectStream(workflowId)
        }
      }

      // 更新状态：当前节点变为 running，后续节点变为 pending（变灰），并清空后续遗留数据
      const currentIdx = NODE_ORDER.indexOf(nodeId)
      setNodeExecStatuses((prev) => {
        const next = { ...prev, [nodeId]: 'running' }
        if (currentIdx !== -1) {
          for (let i = currentIdx + 1; i < NODE_ORDER.length; i++) {
            next[NODE_ORDER[i]] = 'pending'
          }
        }
        return next
      })
      setNodeStreamData((prev) => {
        const nextData = { ...prev }
        if (currentIdx !== -1) {
          // 清除当前节点以及后续节点的数据缓存
          for (let i = currentIdx; i < NODE_ORDER.length; i++) {
            const downKey = NODE_ID_TO_GRAPH_KEY[NODE_ORDER[i]]
            delete nextData[downKey]
          }
        }
        nodeStreamDataRef.current = nextData
        return nextData
      })

      // 如果重跑的是图像生成节点或其上游节点，需要同步清理 store 中的 imageUrl 以显示 loading
      const imageGenIdx = NODE_ORDER.indexOf('image-gen')
      if (currentIdx !== -1 && currentIdx <= imageGenIdx) {
        setImageUrl(null)
      }
    } catch (err) {
      message.error('触发重跑失败')
    }
  }

  /* ============================
      渲染右侧属性面板
   ============================ */
  const renderRightContent = () => {
    if (!selectedNodeId) {
      return (
        <div className={styles.rightPlaceholder}>
          <span className={styles.rightPlaceholderText}>请选择一个节点</span>
        </div>
      )
    }

    // 意图解析节点
    if (selectedNodeId === 'intent') {
      const intentData = getIntentData()
      return (
        <IntentPanel
          userPrompt={userPrompt}
          intentResult={intentData?.intentResult || null}
          onSave={(payload) => handleSaveNode('intent', payload)}
          onReRun={() => handleRerunNode('intent')}
        />
      )
    }

    // 知识库匹配节点
    if (selectedNodeId === 'brand-kb') {
      return (
        <BrandKbPanel
          knowledgeContext={getKnowledgeData()}
          onReRun={() => handleRerunNode('brand-kb')}
        />
      )
    }

    // Prompt 专家节点
    if (selectedNodeId === 'prompt') {
      const promptData = getPromptData()
      return (
        <PromptExpertPanel
          userPrompt={userPrompt}
          promptResult={promptData}
          onSave={(payload) => handleSaveNode('prompt', payload)}
          onReRun={() => handleRerunNode('prompt')}
        />
      )
    }

    // 图像生成节点
    if (selectedNodeId === 'image-gen') {
      return (
        <ImageGenPanel
          selectedModel="flux"
          isExecuting={isImageGenExecuting}
          baseImageUrl={baseImageUrl}
          genParams={generateResult ? undefined : undefined}
          onReRun={() => handleRerunNode('image-gen')}
        />
      )
    }

    // 排版合成节点
    if (selectedNodeId === 'compose') {
      return (
        <ComposePanel
          isComposing={isExecuting && !generateResult}
          finalImageUrl={baseImageUrl}
          onSwitchToPreview={() => setViewTabIndex(1)}
          onReRun={() => handleRerunNode('compose')}
        />
      )
    }

    // 自我评估节点
    if (selectedNodeId === 'eval') {
      return (
        <EvalPanel
          evaluationResult={evaluationResult}
          isEvaluating={isExecuting}
          onReRun={() => handleRerunNode('eval')}
        />
      )
    }

    // 其他节点
    return (
      <div className={styles.rightPlaceholder}>
        <span className={styles.rightPlaceholderText}>
          「{selectedNodeLabel}」节点的属性面板待配置
        </span>
      </div>
    )
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
          {isExecuting && <div className={styles.spinner} />}
          <span>{statusLabel}</span>
          {workflowError && <span className={styles.statusError}> - {workflowError}</span>}
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.center}>
          {viewTabIndex === 0 ? (
            <div className={styles.canvasArea}>
              <ReactFlowProvider>
                <FlowView onNodeClick={handleNodeClick} nodeExecStatuses={nodeExecStatuses} />
              </ReactFlowProvider>
            </div>
          ) : (
            <div className={styles.previewArea}>
              <div className={styles.previewToolbar}>
                <div className={styles.previewToolGroup}>
                  {baseImageUrl && (
                    <button type="button" className={styles.saveImageBtn} onClick={handleSaveImage}>
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
            <div className={styles.imageLightbox} onClick={() => setIsLightboxOpen(false)}>
              <button className={styles.lightboxClose} onClick={() => setIsLightboxOpen(false)}>
                ×
              </button>
              <img src={baseImageUrl} alt="生成海报" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
        </section>

        <aside className={styles.right}>
          <div className={styles.rightHeader}>
            <span className={styles.panelTitle}>
              {selectedNodeLabel ? `节点属性：${selectedNodeLabel}` : '节点属性'}
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
        onSave={(data) => {
          console.log('保存到知识库：', data)
        }}
      />
    </div>
  )
}

export default Workspace
