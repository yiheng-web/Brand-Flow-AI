import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import { message } from 'antd'
import { DownOutlined, LockFilled } from '@ant-design/icons'
import { SelectionTabs } from '../../components/SelectionTabs'
import { SwitchTabs } from '../../components/SwitchTabs'
import {
  DEFAULT_TAGS,
  SLIDER_CONFIG,
  WORKSPACE_ASSET_ITEMS,
  WORKSPACE_GROUP_OPTIONS,
  WORKSPACE_HISTORY_RECORDS,
  WORKSPACE_SIDE_TABS,
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
  const navState = location.state as { prompt?: string; workflowId?: string }
  const passedWorkflowId = navState?.workflowId ?? null

  /* ---- 视图 / 节点选择 / 抽屉 ---- */
  const [viewTabIndex, setViewTabIndex] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<FlowNodeId | null>(null)


  // 兜底映射表：用于将任务结束时后端发来的扁平全量 finalState 结构，自动还原装配到对应的 Node 包裹下
  const finalStateToNodeMap = [
    { stateKey: 'intentResult', nodeKey: 'intentNode' },
    { stateKey: 'knowledgeContext', nodeKey: 'knowledgeNode' },
    { stateKey: 'promptResult', nodeKey: 'promptNode' },
    { stateKey: 'generateResult', nodeKey: 'generateNode' },
    { stateKey: 'evaluationResult', nodeKey: 'evaluateNode' },
  ]

  /* ---- 侧边栏状态 ---- */
  const [selectedGroupKey, setSelectedGroupKey] = useState(WORKSPACE_GROUP_OPTIONS[0].key)
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false)
  const [leftTabIndex, setLeftTabIndex] = useState(0)
  const closeMenuTimerRef = useRef<number | null>(null)
  const groupSelectWrapRef = useRef<HTMLDivElement | null>(null)

  const selectedGroup =
    WORKSPACE_GROUP_OPTIONS.find((option) => option.key === selectedGroupKey) ??
    WORKSPACE_GROUP_OPTIONS[0]

  const handleSelectGroup = (key: string) => {
    setSelectedGroupKey(key)
    if (closeMenuTimerRef.current) window.clearTimeout(closeMenuTimerRef.current)
    closeMenuTimerRef.current = window.setTimeout(() => {
      setIsGroupMenuOpen(false)
      closeMenuTimerRef.current = null
    }, 220)
  }

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!groupSelectWrapRef.current?.contains(event.target as Node)) {
        setIsGroupMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      if (closeMenuTimerRef.current) window.clearTimeout(closeMenuTimerRef.current)
    }
  }, [])

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
    agentState,
    nodeExecStatuses,
    nodeStreamData,
    setWorkflowId,
    setStatus: setWorkflowStatus,
    setPrompt: setStoredPrompt,
    setImageUrl,
    setAgentState,
    setError: setWorkflowError,
    setNodeExecStatuses,
    setNodeStreamData,
    reset,
  } = useWorkflowStore()

  // 合并 navState 的 prompt 和 store 的 prompt
  const userPrompt = navState?.prompt || storedPrompt

  /** 是否正在启动工作流（提交中） */
  const [isSubmitting, setIsSubmitting] = useState(false)

  /* ---- 引用：SSE 连接 / 轮询定时器 ---- */
  const eventSourceRef = useRef<{ close: () => void } | null>(null)
  const nodeStreamDataRef = useRef<Record<string, Record<string, unknown>>>({})

  /* ============================
      工作流启动
   ============================ */
  const startWorkflow = useCallback(async () => {
    if (!userPrompt.trim()) return
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
      const id: string = res.id || (res as unknown as { data?: { id: string } }).data?.id
      if (!id) throw new Error('创建工作流后未返回 ID')

      setWorkflowId(id) // 同步到 store
      setWorkflowStatus('running')
      setIsSubmitting(false)

      // 标记第一个节点为 running
      setNodeExecStatuses({ ...nodeExecStatuses, intent: 'running' })

      // 仅启动 SSE
      connectStream(id)
    } catch (err) {
      setWorkflowStatus('failed')
      setWorkflowError(
        err instanceof Error ? err.message : '提交创意失败，请重试'
      )
      setIsSubmitting(false)
    }
  }, [userPrompt, setStoredPrompt, setWorkflowId, setWorkflowError, setWorkflowStatus, setNodeExecStatuses, setNodeStreamData])

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
          const data: Record<string, unknown> = event.data

          // data 的 key 是节点名（如 intentNode），value 是该节点的输出
          const nodeKey = Object.keys(data)[0]
          if (!nodeKey) return

          const nodeValue = data[nodeKey] as Record<string, unknown>

          // 更新累积数据（同步到 store）
          const updatedStreamData = { ...useWorkflowStore.getState().nodeStreamData, [nodeKey]: nodeValue }
          nodeStreamDataRef.current = updatedStreamData
          setNodeStreamData(updatedStreamData)

          // 根据节点 key 更新对应 node 的执行状态 & 标记下一个节点
          const currentNodeId = Object.entries(NODE_ID_TO_GRAPH_KEY).find(
            ([, v]) => v === nodeKey
          )?.[0] as FlowNodeId | undefined

          if (currentNodeId) {
            const currentIdx = NODE_ORDER.indexOf(currentNodeId)
            const nextStatuses: Record<FlowNodeId, NodeExecStatus> = {
              ...useWorkflowStore.getState().nodeExecStatuses,
              [currentNodeId]: 'done',
            }
            // 将下一个节点标记为 running
            const nextIdx = currentIdx + 1
            if (nextIdx < NODE_ORDER.length) {
              nextStatuses[NODE_ORDER[nextIdx]] = 'running'
            }
            setNodeExecStatuses(nextStatuses)
          }
          return
        }

        if (event.type === 'completed' && event.data) {
          const finalState = event.data as AgentState | undefined

          setWorkflowStatus('completed')

            // 写入最终数据（同步到 store）
            if (finalState) {
              nodeStreamDataRef.current = {}
              const newState: Record<string, unknown> = {}
              // 根据映射表动态组装还原
              finalStateToNodeMap.forEach(({ stateKey, nodeKey }) => {
                if ((finalState as unknown as Record<string, unknown>)[stateKey] !== undefined) {
                  newState[nodeKey] = { [stateKey]: (finalState as unknown as Record<string, unknown>)[stateKey] }
                  nodeStreamDataRef.current[nodeKey] = newState[nodeKey] as Record<string, unknown>
                }
              })
              setNodeStreamData({ ...nodeStreamDataRef.current })
              setAgentState(finalState) // 同步到 store，自动更新 imageUrl
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
        // 连接错误，依靠轮询兜底
      },
    })

    eventSourceRef.current = conn
  }, [setNodeStreamData, setNodeExecStatuses, setWorkflowStatus, setAgentState, setWorkflowError])


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
      工作流启动（自动）
   ============================ */
  useEffect(() => {
    const id = passedWorkflowId || workflowId
    if (!id && !userPrompt) return

    if (id) {
      // 有 workflowId，直接连接 SSE
      if (workflowStatus === 'idle' || workflowStatus === 'pending') {
        setWorkflowStatus('running')
      }
      connectStream(id)
    } else if (userPrompt && workflowStatus === 'idle') {
      // 只有 userPrompt 没有 workflowId，从头创建
      startWorkflow()
    }
  }, [userPrompt, passedWorkflowId, workflowId, workflowStatus, setWorkflowStatus, connectStream, startWorkflow])

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
  const baseImageUrl = imageUrl // 直接用 store 的 imageUrl
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
          isExecuting={isImageGenExecuting}
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
        <aside className={styles.left}>
          <div className={styles.sideTabs}>
            <SelectionTabs items={WORKSPACE_SIDE_TABS} onChange={(index) => setLeftTabIndex(index)} />
          </div>
          <div className={styles.sideContent}>
            {leftTabIndex === 0 ? (
              <div className={styles.assetPanel}>
                <div ref={groupSelectWrapRef} className={styles.groupSelectWrap}>
                  <button
                    className={styles.groupSelect}
                    type="button"
                    onClick={() => setIsGroupMenuOpen((open) => !open)}
                  >
                    <span className={styles.groupSelectContent}>
                      <span className={styles.groupSelectIcon}>{selectedGroup.icon}</span>
                      <span className={styles.groupSelectText}>{selectedGroup.label}</span>
                    </span>
                    <span
                      className={`${styles.groupSelectArrow} ${
                        isGroupMenuOpen ? styles.groupSelectArrowOpen : ''
                      }`}
                    >
                      <DownOutlined />
                    </span>
                  </button>

                  {isGroupMenuOpen ? (
                    <div className={styles.groupMenu}>
                      {WORKSPACE_GROUP_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          className={`${styles.groupMenuItem} ${
                            option.key === selectedGroupKey ? styles.groupMenuItemActive : ''
                          }`}
                          type="button"
                          onClick={() => handleSelectGroup(option.key)}
                        >
                          <span className={styles.groupMenuItemContent}>
                            <span className={styles.groupMenuItemIcon}>{option.icon}</span>
                            <span className={styles.groupMenuItemText}>{option.label}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={styles.permissionTip}>
                  <span className={styles.permissionTipIcon}>
                    <LockFilled />
                  </span>
                  <span>仅限查看/调用，无上传规范权限</span>
                </div>

                <div className={styles.assetSection}>
                  <h3 className={styles.assetSectionTitle}>匹配资产（拖拽至画布可用）</h3>

                  <div className={styles.assetList}>
                    {WORKSPACE_ASSET_ITEMS.map((asset) => (
                      <div key={asset.id} className={styles.assetCard}>
                        {asset.type === 'color' ? (
                          <div
                            className={styles.colorSwatch}
                            style={{ background: asset.value }}
                          />
                        ) : (
                          <div className={styles.fileBadge}>{asset.badge}</div>
                        )}
                        <span className={styles.assetName}>{asset.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.historyPanel}>
                <div className={styles.historyHeader}>
                  <span className={styles.historyTitle}>最近历史</span>
                  <span className={styles.historyCount}>{WORKSPACE_HISTORY_RECORDS.length} 条记录</span>
                </div>

                <div className={styles.historyList}>
                  {WORKSPACE_HISTORY_RECORDS.map((record) => (
                    <div key={record.id} className={styles.historyCard}>
                      <div className={styles.historyMetaRow}>
                        <span className={styles.historyTag}>{record.tag}</span>
                        <span className={styles.historyTime}>{record.time}</span>
                      </div>
                      <div className={styles.historyName}>{record.title}</div>
                      <div className={styles.historyDesc}>{record.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

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
        groupOptions={WORKSPACE_GROUP_OPTIONS}
        selectedGroupKey={selectedGroupKey}
        onClose={() => setIsSaveModalVisible(false)}
        onSave={() => {
          message.info('功能开发中，敬请期待')
        }}
      />
      

    </div>
  )
}

export default Workspace