import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  ExportOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  PlayCircleFilled,
  QuestionCircleOutlined,
  RedoOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { Button, Progress, Tooltip, message } from 'antd'

import { IconButton, StatusBadge, type SemanticStatus } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'
import { SwitchTabs } from '../../components/SwitchTabs'
import {
  DEFAULT_TAGS,
  FLOW_NODES,
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
  type WorkflowNodeSnapshot,
  getWorkflowDetail,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const Workspace = () => {
  const location = useLocation()
  const navState = location.state as { prompt?: string; workflowId?: string } | null

  /* ---- 视图 / 节点选择 ---- */
  const [viewTabIndex, setViewTabIndex] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<FlowNodeId | null>('intent')
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId as FlowNodeId)
  }

  const selectedNodeLabel = selectedNodeId ? NODE_LABELS[selectedNodeId] : null

  /* ---- 标签 / 保存知识库弹窗 ---- */
  const [tags, setTags] = useState<string[]>([...DEFAULT_TAGS])
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const currentSpaceId = useUserStore((state) => state.currentSpaceId)
  const currentSpaceType = useUserStore((state) => state.currentSpaceType)

  useEffect(() => {
    if (!isLightboxOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLightboxOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen])

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
            const nodeKey = event.nodeType
            if (!nodeKey) return
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
            const nodeKey = event.nodeType
            if (!nodeKey) return
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
            const nodeKey = event.nodeType
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
              const currentIdx = NODE_ORDER.indexOf(currentNodeId)
              setNodeExecStatuses((prev) => {
                const next: Record<FlowNodeId, NodeExecStatus> = {
                  ...prev,
                  [currentNodeId]: isSkipped ? 'skipped' : 'done',
                }
                // 将下一个节点标记为 running（跳过 compose 节点，因为后端没有 composeNode）
                let nextIdx = currentIdx + 1
                while (nextIdx < NODE_ORDER.length) {
                  const nextNodeId = NODE_ORDER[nextIdx]
                  // 如果后端不存在该节点映射，继续找下一个
                  if (NODE_ID_TO_GRAPH_KEY[nextNodeId]) {
                    next[nextNodeId] = 'running'
                    break
                  }
                  // 跳过无映射的节点（如 compose），直接标记为 done
                  next[nextNodeId] = 'done'
                  nextIdx++
                }
                return next
              })

              // 从 generateNode 完成事件中提前提取图片 URL
              if (nodeKey === 'generateNode') {
                const nestedResult = nodeValue.generateResult
                const genResult = isRecord(nestedResult) ? nestedResult : nodeValue
                const content = genResult.content
                if (typeof content === 'string' && content.startsWith('http')) {
                  setImageUrl(content)
                }
              }
            }
            return
          }

          if (event.type === 'workflow_completed' && event.data) {
            const finalState = event.data as unknown as AgentState | undefined

            setWorkflowStatus('completed')

            // 写入最终数据（同步到 store）
            if (finalState) {
              nodeStreamDataRef.current = {}

              // finalState 中的 key 分别是 intentResult, knowledgeContext, promptResult 等
              // 我们需要把它们映射回 nodeStreamData 对应的 nodeKey（如 intentNode, promptNode）
              const finalOutputs: Partial<Record<string, unknown>> = {
                intentNode: finalState.intentResult,
                knowledgeNode: finalState.knowledgeContext,
                promptNode: finalState.promptResult,
                generateNode: finalState.generateResult,
                evaluateNode: finalState.evaluationResult,
              }

              Object.entries(finalOutputs).forEach(([graphKey, value]) => {
                if (!value) return
                const stateKey =
                  graphKey === 'intentNode'
                    ? 'intentResult'
                    : graphKey === 'knowledgeNode'
                      ? 'knowledgeContext'
                      : graphKey === 'promptNode'
                        ? 'promptResult'
                        : graphKey === 'generateNode'
                          ? 'generateResult'
                          : 'evaluationResult'
                nodeStreamDataRef.current[graphKey] = { [stateKey]: value }
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
      状态恢复与同步 (Rehydration)
   ============================ */
  const syncWorkflowState = useCallback(
    async (id: string) => {
      try {
        const data = await getWorkflowDetail(id)
        const workflow = data.workflow
        const nodes = data.nodes || []

        setWorkflowStatus(workflow.status)
        if (workflow.errorMessage) {
          setWorkflowError(workflow.errorMessage)
        }

        const newStatuses: Record<FlowNodeId, NodeExecStatus> = {
          intent: 'pending',
          'brand-kb': 'pending',
          prompt: 'pending',
          'image-gen': 'pending',
          compose: 'pending',
          eval: 'pending',
        }
        const newData: Record<string, Record<string, unknown>> = {}

        let hasRunning = false
        nodes.forEach((node: WorkflowNodeSnapshot) => {
          const nodeId = Object.entries(NODE_ID_TO_GRAPH_KEY).find(
            ([, v]) => v === node.type,
          )?.[0] as FlowNodeId | undefined
          if (nodeId) {
            if (node.status === 'completed' || node.status === 'stale') {
              newStatuses[nodeId] = 'done'
            } else if (node.status === 'failed') {
              newStatuses[nodeId] = 'failed'
            } else if (node.status === 'running') {
              newStatuses[nodeId] = 'running'
              hasRunning = true
            }
            if (node.output) {
              newData[node.type] = node.output
            }
          }
        })

        if (workflow.status !== 'completed' && workflow.status !== 'failed' && !hasRunning) {
          for (const nodeId of NODE_ORDER) {
            if (newStatuses[nodeId] === 'pending') {
              newStatuses[nodeId] = 'running'
              break
            }
          }
        }

        setNodeExecStatuses(newStatuses)
        setNodeStreamData(newData)
        nodeStreamDataRef.current = newData

        // 如果未完成，则连接 SSE 接力执行
        if (workflow.status !== 'completed' && workflow.status !== 'failed') {
          connectStream(id)
        }
      } catch (err) {
        console.error('获取工作流详情失败:', err)
        setWorkflowStatus('failed')
        setWorkflowError('无法恢复工作流状态，可能由于越权拦截或网络异常。')
      }
    },
    [setWorkflowStatus, setWorkflowError, setNodeExecStatuses, setNodeStreamData, connectStream],
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
        spaceId: currentSpaceId || 'personal',
        spaceType: currentSpaceType,
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
    currentSpaceId,
    currentSpaceType,
  ])

  /* ---- 自动启动工作流 / 断线重连 ---- */
  useEffect(() => {
    // 场景 1: 从首页带来了全新的 workflowId
    if (navState?.workflowId && navState.workflowId !== workflowId) {
      setWorkflowId(navState.workflowId)
      // 场景 1: 从外部点进来，先同步恢复状态
      syncWorkflowState(navState.workflowId)
    }
    // 场景 2: 仅带来了 prompt，没有 workflowId (直接启动)
    else if (navState?.prompt && workflowStatus === 'idle' && !workflowId) {
      queueMicrotask(() => void startWorkflow())
    }
    // 场景 3: 页面刷新，已存在 workflowId，但 SSE 连接已断开，重新同步状态并连接
    else if (
      workflowId &&
      (workflowStatus === 'running' || workflowStatus === 'pending') &&
      !eventSourceRef.current
    ) {
      syncWorkflowState(workflowId)
    }
  }, [navState, workflowId, workflowStatus, setWorkflowId, syncWorkflowState, startWorkflow])

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
    return promptData.promptResult || (promptData as unknown as PromptChainOutput)
  }

  /** 获取生成结果（图片 URL） */
  const getGenerateData = (): GenerateResult | null => {
    const genData = nodeStreamData['generateNode'] as
      | { generateResult?: GenerateResult }
      | undefined
    if (!genData) return null
    return genData.generateResult || (genData as unknown as GenerateResult)
  }

  /** 获取评估结果 */
  const getEvalData = (): EvaluationResult | null => {
    const evalData = nodeStreamData['evaluateNode'] as
      | { evaluationResult?: EvaluationResult }
      | undefined
    if (!evalData) return null
    return evalData.evaluationResult || (evalData as unknown as EvaluationResult)
  }

  /* ---- derived state ---- */
  const isExecuting = workflowStatus === 'running' || isSubmitting
  const generateResult = getGenerateData()
  const baseImageUrl = imageUrl
  const evaluationResult = getEvalData()

  // 图像生成节点专用：只有节点状态不是 done 且 workflow 还在运行时才显示 loading
  const isImageGenExecuting = nodeExecStatuses['image-gen'] !== 'done' && isExecuting

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
      const response = await fetch(url)
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
      message.error('保存失败，请重试')
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
    } catch {
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
    } catch {
      message.error('触发重跑失败')
    }
  }
  // 前往下一个节点
  const handleNextNode = () => {
    if (!selectedNodeId) return
    const currentIdx = NODE_ORDER.indexOf(selectedNodeId)
    if (currentIdx === -1 || currentIdx >= NODE_ORDER.length - 1) return
    setSelectedNodeId(NODE_ORDER[currentIdx + 1])
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

  const completedNodeCount = NODE_ORDER.filter((nodeId) =>
    ['done', 'skipped'].includes(nodeExecStatuses[nodeId]),
  ).length
  const progressPercent = Math.round((completedNodeCount / NODE_ORDER.length) * 100)
  const workflowSemanticStatus: SemanticStatus =
    workflowStatus === 'completed'
      ? 'success'
      : workflowStatus === 'failed'
        ? 'failed'
        : workflowStatus === 'running'
          ? 'running'
          : workflowStatus === 'pending'
            ? 'queued'
            : 'ready'

  return (
    <div className={styles.wrapper}>
      <header className={styles.workspaceTopBar}>
        <div className={styles.workflowIdentity}>
          <span className={styles.eyebrow}>AI 创作工作流</span>
          <strong className={styles.workflowTitle}>{userPrompt || '未命名工作流'}</strong>
          <span className={styles.autoSave}>已自动保存</span>
        </div>

        <SwitchTabs
          items={WORKSPACE_VIEW_TABS}
          defaultIndex={viewTabIndex}
          onChange={(index) => setViewTabIndex(index)}
        />

        <div className={styles.workspaceActions}>
          <div className={styles.historyActions}>
            <IconButton label="撤销（即将支持）" icon={<UndoOutlined />} disabled />
            <IconButton label="重做（即将支持）" icon={<RedoOutlined />} disabled />
            <IconButton label="历史版本（即将支持）" icon={<HistoryOutlined />} disabled />
          </div>
          <IconButton
            label="使用帮助"
            icon={<QuestionCircleOutlined />}
            onClick={() => message.info('选择节点可查看输入、输出与重跑操作')}
          />
          <Button icon={<EyeOutlined />} onClick={() => setViewTabIndex(1)}>
            预览
          </Button>
          <Button icon={<ExportOutlined />} disabled={!baseImageUrl} onClick={handleSaveImage}>
            导出
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleFilled />}
            loading={isSubmitting}
            disabled={!userPrompt?.trim() || isExecuting}
            onClick={startWorkflow}
          >
            运行工作流
          </Button>
        </div>
      </header>

      <div
        className={`${styles.workspaceBody} ${inspectorCollapsed ? styles.inspectorCollapsed : ''}`}
      >
        <aside className={styles.resourcePanel} aria-label="工作流资源">
          <div className={styles.resourceHeader}>
            <div>
              <span className={styles.eyebrow}>资源与节点</span>
              <h2>工作流节点</h2>
            </div>
            <Tooltip title="节点库">
              <AppstoreOutlined aria-label="节点库" />
            </Tooltip>
          </div>
          <div className={styles.resourceSearch} role="search">
            <span>按执行顺序选择节点</span>
          </div>
          <div className={styles.nodeLibrary}>
            {FLOW_NODES.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`${styles.libraryNode} ${selectedNodeId === node.id ? styles.libraryNodeActive : ''}`}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span className={styles.libraryStep}>{node.step}</span>
                <span className={styles.libraryText}>
                  <strong>{node.title}</strong>
                  <small>{node.subtitle}</small>
                </span>
              </button>
            ))}
          </div>
          <div className={styles.resourceLinks}>
            <button type="button" onClick={() => message.info('模板将在后续版本接入')}>
              <AppstoreOutlined /> <span>模板</span>
            </button>
            <button type="button" onClick={() => message.info('可从主导航进入知识库')}>
              <DatabaseOutlined /> <span>品牌知识</span>
            </button>
            <button type="button" onClick={() => message.info('可从主导航进入品牌资产')}>
              <FolderOpenOutlined /> <span>素材资产</span>
            </button>
            <button type="button" onClick={() => message.info('执行历史将在后续版本接入')}>
              <ClockCircleOutlined /> <span>执行历史</span>
            </button>
          </div>
        </aside>

        <section className={styles.center} aria-label="工作流画布">
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
                  <span className={styles.previewPlaceholder}>
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
              role="dialog"
              aria-modal="true"
              aria-label="生成结果预览"
              onClick={() => setIsLightboxOpen(false)}
            >
              <button
                type="button"
                aria-label="关闭预览"
                className={styles.lightboxClose}
                onClick={() => setIsLightboxOpen(false)}
              >
                <CloseOutlined />
              </button>
              <img src={baseImageUrl} alt="生成海报" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
        </section>

        <aside className={styles.right} aria-label="节点检查器">
          <div className={styles.rightHeader}>
            <div>
              <span className={styles.eyebrow}>Inspector</span>
              <span className={styles.panelTitle}>{selectedNodeLabel || '节点属性'}</span>
            </div>
            <IconButton
              label="收起检查器"
              icon={<DoubleRightOutlined />}
              onClick={() => setInspectorCollapsed(true)}
              size="small"
            />
          </div>
          {renderRightContent()}
          {selectedNodeId && NODE_ORDER.indexOf(selectedNodeId) < NODE_ORDER.length - 1 && (
            <div className={styles.nextNodeBar}>
              <button type="button" className={styles.nextNodeBtn} onClick={handleNextNode}>
                下一节点：{NODE_LABELS[NODE_ORDER[NODE_ORDER.indexOf(selectedNodeId) + 1]]} →
              </button>
            </div>
          )}
        </aside>

        {inspectorCollapsed && (
          <button
            type="button"
            className={styles.openInspectorButton}
            aria-label="展开节点检查器"
            onClick={() => setInspectorCollapsed(false)}
          >
            <DoubleLeftOutlined />
            <span>检查器</span>
          </button>
        )}
      </div>

      <footer className={styles.executionBar} aria-live="polite">
        <div className={styles.executionStatus}>
          <StatusBadge status={workflowSemanticStatus} label={statusLabel} />
          <span className={styles.executionStage}>
            {workflowError ||
              (selectedNodeLabel ? `当前查看：${selectedNodeLabel}` : '等待选择节点')}
          </span>
        </div>
        <div className={styles.executionProgress}>
          <span>整体进度</span>
          <Progress percent={progressPercent} size="small" showInfo={false} />
          <strong>{progressPercent}%</strong>
        </div>
        <div className={styles.executionMeta}>
          <span>模型：Flux</span>
          <span>耗时：--</span>
          <span>费用：待计算</span>
          <Button type="text" size="small" icon={<HistoryOutlined />} disabled>
            详细日志
          </Button>
        </div>
      </footer>

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
