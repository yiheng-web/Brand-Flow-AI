import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
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
  getWorkflowStatus,
  type IntentOutput,
  type PromptChainOutput,
  type GenerateResult,
  type EvaluationResult,
  type AgentState,
  type WorkflowStatusResponse,
} from '../../api/workflow'
import { createAuthEventSource } from '../../utils/sse'

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
  const userPrompt = (location.state as { prompt?: string })?.prompt ?? ''

  /* ---- 视图 / 节点选择 ---- */
  const [viewTabIndex, setViewTabIndex] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<FlowNodeId | null>(null)

  /* ---- 标签 / 保存知识库弹窗 ---- */
  const [tags, setTags] = useState<string[]>([...DEFAULT_TAGS])
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false)

  /* ===== 工作流生命周期 ===== */
  const [workflowStatus, setWorkflowStatus] = useState<
    'idle' | 'pending' | 'running' | 'completed' | 'failed'
  >('idle')
  const [workflowError, setWorkflowError] = useState<string | null>(null)

  /** 每个节点的执行状态 */
  const [nodeExecStatuses, setNodeExecStatuses] = useState<
    Record<FlowNodeId, NodeExecStatus>
  >({
    intent: 'pending',
    'brand-kb': 'pending',
    prompt: 'pending',
    'image-gen': 'pending',
    compose: 'pending',
    eval: 'pending',
  })

  /** 每个节点从 SSE progress 收到的数据（实时累积） */
  const [nodeStreamData, setNodeStreamData] = useState<
    Record<string, Record<string, any>>
  >({})

  /** 是否正在启动工作流（提交中） */
  const [isSubmitting, setIsSubmitting] = useState(false)

  /* ---- 引用：SSE 连接 / 轮询定时器 ---- */
  const eventSourceRef = useRef<{ close: () => void } | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nodeStreamDataRef = useRef<Record<string, Record<string, any>>>({})

  /* ============================
      工作流启动
   ============================ */
  const startWorkflow = useCallback(async () => {
    if (!userPrompt.trim()) return
    setIsSubmitting(true)
    setWorkflowError(null)
    setWorkflowStatus('pending')
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
      const id: string = res.data?.id || (res as any).id
      if (!id) throw new Error('创建工作流后未返回 ID')

      setWorkflowStatus('running')
      setIsSubmitting(false)

      // 标记第一个节点为 running
      setNodeExecStatuses((prev) => ({ ...prev, intent: 'running' }))

      // 同时启动 SSE 和轮询
      connectStream(id)
      startPolling(id)
    } catch (err) {
      setWorkflowStatus('failed')
      setWorkflowError(
        err instanceof Error ? err.message : '提交创意失败，请重试'
      )
      setIsSubmitting(false)
    }
  }, [userPrompt])

  /* ============================
      SSE 流式连接
   ============================ */
  const connectStream = useCallback((id: string) => {
    // 关闭旧的 SSE 连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const apiBase = 'http://localhost:3000/api'
    const url = `${apiBase}/workflow/${id}/stream`

    const conn = createAuthEventSource(url, {
      onMessage: (event) => {
        if (event.type === 'connected') {
          // SSE 连接成功建立
          return
        }

        if (event.type === 'progress' && event.data) {
          const data: Record<string, any> = event.data

          // data 的 key 是节点名（如 intentNode），value 是该节点的输出
          const nodeKey = Object.keys(data)[0]
          if (!nodeKey) return

          const nodeValue = data[nodeKey] as Record<string, any>

          // 更新累积数据
          setNodeStreamData((prev) => {
            const updated = { ...prev, [nodeKey]: nodeValue }
            nodeStreamDataRef.current = updated
            return updated
          })

          // 根据节点 key 更新对应 node 的执行状态 & 标记下一个节点
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

        if (event.type === 'completed' && event.data) {
          const finalState = event.data as AgentState | undefined

          // completed 事件后停止轮询
          stopPolling()

          setWorkflowStatus('completed')

          // 写入最终数据
          if (finalState) {
            nodeStreamDataRef.current = {}
            NODE_ORDER.forEach((nodeId) => {
              const graphKey = NODE_ID_TO_GRAPH_KEY[nodeId]
              const val = (finalState as any)[graphKey] || null
              if (val) {
                nodeStreamDataRef.current[graphKey] = val
              }
            })
            setNodeStreamData({ ...nodeStreamDataRef.current })
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
          stopPolling()
          conn.close()
          eventSourceRef.current = null
        }
      },
      onError: () => {
        // 连接错误，依靠轮询兜底
      },
    })

    eventSourceRef.current = conn
  }, [])

  /* ============================
      轮询 status（SSE 兜底）
   ============================ */
  const startPolling = useCallback((id: string) => {
    stopPolling()
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await getWorkflowStatus(id)
        const resp: WorkflowStatusResponse = res.data || res

        const s = resp.status || resp.data?.status

        if (s === 'completed') {
          stopPolling()
          setWorkflowStatus('completed')
          setNodeExecStatuses({
            intent: 'done',
            'brand-kb': 'done',
            prompt: 'done',
            'image-gen': 'done',
            compose: 'done',
            eval: 'done',
          })

          // 从轮询结果中填充最终数据（SSE 已断开时兜底）
          const agentState = resp.result || resp.data?.result
          if (agentState) {
            const mapped: Record<string, Record<string, any>> = {}
            if (agentState.intentResult) {
              mapped.intentNode = agentState.intentResult as any
            }
            if (agentState.knowledgeContext) {
              mapped.knowledgeNode = {
                knowledgeContext: agentState.knowledgeContext,
              }
            }
            if (agentState.promptResult) {
              mapped.promptNode = agentState.promptResult as any
            }
            if (agentState.generateResult) {
              mapped.generateNode = agentState.generateResult as any
            }
            if (agentState.evaluationResult) {
              mapped.evaluateNode = agentState.evaluationResult as any
            }
            nodeStreamDataRef.current = mapped
            setNodeStreamData({ ...mapped })
          }
        } else if (s === 'failed') {
          stopPolling()
          setWorkflowStatus('failed')
          setWorkflowError(
            resp.errorMessage || resp.data?.errorMessage || '工作流执行失败'
          )
        }
      } catch {
        // 轮询失败静默处理，下次继续
      }
    }, 2000)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  /* ---- 清理 ---- */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      stopPolling()
    }
  }, [stopPolling])

  /* ============================
      工作流启动（自动）
   ============================ */
  useEffect(() => {
    if (userPrompt && workflowStatus === 'idle') {
      startWorkflow()
    }
  }, [userPrompt, workflowStatus, startWorkflow])

  /* ---- 节点点击 ---- */
  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId as FlowNodeId)
  }

  const selectedNodeLabel = selectedNodeId ? NODE_LABELS[selectedNodeId] : null

  /* ============================
      从 SSE 累积数据中提取各面板所需数据
   ============================ */

  /** 获取意图解析数据 */
  const getIntentData = (): { keywords?: string[]; sceneType?: string; intentResult?: IntentOutput } | null => {
    const intentData = nodeStreamData['intentNode']
    if (!intentData) return null
    return {
      intentResult: intentData as IntentOutput,
      keywords: intentData.intent ? [intentData.intent] : undefined,
      sceneType: intentData.intent || undefined,
    }
  }

  /** 获取知识库匹配数据 */
  const getKnowledgeData = (): string | null => {
    const kbData = nodeStreamData['knowledgeNode']
    if (!kbData) return null
    return kbData.knowledgeContext || null
  }

  /** 获取 Prompt 专家数据 */
  const getPromptData = (): PromptChainOutput | null => {
    const promptData = nodeStreamData['promptNode']
    if (!promptData) return null
    return promptData as PromptChainOutput
  }

  /** 获取生成结果（图片 URL） */
  const getGenerateData = (): GenerateResult | null => {
    const genData = nodeStreamData['generateNode']
    if (!genData) return null
    return genData as GenerateResult
  }

  /** 获取评估结果 */
  const getEvalData = (): EvaluationResult | null => {
    const evalData = nodeStreamData['evaluateNode']
    if (!evalData) return null
    return evalData as EvaluationResult
  }

  /* ---- derived state ---- */
  const isExecuting = workflowStatus === 'running' || isSubmitting
  const generateResult = getGenerateData()
  const baseImageUrl = generateResult?.content || null
  const evaluationResult = getEvalData()

  const statusLabel = (() => {
    if (isSubmitting) return '提交中…'
    if (workflowStatus === 'pending') return '排队中'
    if (workflowStatus === 'running') return '运行中'
    if (workflowStatus === 'completed') return '已完成'
    if (workflowStatus === 'failed') return '失败'
    return '等待开始'
  })()

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
        />
      )
    }

    // 知识库匹配节点
    if (selectedNodeId === 'brand-kb') {
      return (
        <BrandKbPanel
          knowledgeContext={getKnowledgeData()}
          onReRun={() => {
            console.log('重新运行知识匹配')
          }}
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
        />
      )
    }

    // 图像生成节点
    if (selectedNodeId === 'image-gen') {
      return (
        <ImageGenPanel
          selectedModel="flux"
          isExecuting={isExecuting}
          baseImageUrl={baseImageUrl}
          genParams={generateResult ? undefined : undefined}
          onReRun={() => {
            console.log('重新运行图像生成节点')
          }}
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
          onReRun={() => {
            console.log('重新运行排版合成节点')
          }}
        />
      )
    }

    // 自我评估节点
    if (selectedNodeId === 'eval') {
      return (
        <EvalPanel
          evaluationResult={evaluationResult}
          isEvaluating={isExecuting}
          onReRun={() => {
            console.log('重新运行评估节点')
          }}
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
          {workflowError && (
            <span className={styles.statusError}> - {workflowError}</span>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.center}>
          {viewTabIndex === 0 ? (
            <div className={styles.canvasArea}>
              <ReactFlowProvider>
                <FlowView
                  onNodeClick={handleNodeClick}
                  nodeExecStatuses={nodeExecStatuses}
                />
              </ReactFlowProvider>
            </div>
          ) : (
            <div className={styles.previewArea}>
              <div className={styles.previewCanvas}>
                {baseImageUrl && (
                  <img
                    src={baseImageUrl}
                    alt="生成海报"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                )}
              </div>
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
        onSave={(data) => {
          console.log('保存到知识库：', data)
        }}
      />
    </div>
  )
}

export default Workspace