import { useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { DownOutlined, LockFilled } from '@ant-design/icons'
import { useLocation } from 'react-router-dom'
import { message, Drawer } from 'antd'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useAuthStore } from '@/store/useAuthStore'
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
} from './workspace.const'
import FlowView from './components/FlowView'
import CanvasPreview from './components/CanvasPreview'
import SaveKnowledgeModal from './components/SaveKnowledgeModal'
import styles from './workspace.module.css'

const Workspace = () => {
  const location = useLocation()
  const { token } = useAuthStore()
  const workflowId = location.state?.workflowId

  const [workflowStatus, setWorkflowStatus] = useState('pending')
  const [progressData, setProgressData] = useState<Record<string, unknown> | null>(null)
  
  // 用于弹窗查看节点详情
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    setIsDrawerOpen(true)
  }

  // 映射前端 UI 节点 ID 到后端 agent 推理抛出的真实节点名
  const backendNodeKeyMap: Record<string, string> = {
    'intent': 'intentNode',
    'brand-kb': 'knowledgeNode',
    'prompt': 'promptNode',
    'image-gen': 'generateNode',
    'compose': 'composeNode', // 预留
    'eval': 'evaluateNode'
  }

  // 兜底映射表：用于将任务结束时后端发来的扁平全量 finalState 结构，自动还原装配到对应的 Node 包裹下
  const finalStateToNodeMap = [
    { stateKey: 'intentResult', nodeKey: 'intentNode' },
    { stateKey: 'knowledgeContext', nodeKey: 'knowledgeNode' },
    { stateKey: 'promptResult', nodeKey: 'promptNode' },
    { stateKey: 'generateResult', nodeKey: 'generateNode' },
    { stateKey: 'evaluationResult', nodeKey: 'evaluateNode' },
  ]

  const [viewTabIndex, setViewTabIndex] = useState(0)
  const [selectedGroupKey, setSelectedGroupKey] = useState(WORKSPACE_GROUP_OPTIONS[0].key)
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(true)
  const [leftTabIndex, setLeftTabIndex] = useState(0)
  const [tags, setTags] = useState<string[]>([...DEFAULT_TAGS])
  const [isTagInputVisible, setIsTagInputVisible] = useState(false)
  const [editingTagValue, setEditingTagValue] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)
  const [sliderValue, setSliderValue] = useState(SLIDER_CONFIG.defaultValue)
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false)
  const closeMenuTimerRef = useRef<number | null>(null)
  const groupSelectWrapRef = useRef<HTMLDivElement | null>(null)

  const selectedGroup =
    WORKSPACE_GROUP_OPTIONS.find((option) => option.key === selectedGroupKey) ??
    WORKSPACE_GROUP_OPTIONS[0]

  const handleSelectGroup = (key: string) => {
    setSelectedGroupKey(key)

    if (closeMenuTimerRef.current) {
      window.clearTimeout(closeMenuTimerRef.current)
    }

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

      if (closeMenuTimerRef.current) {
        window.clearTimeout(closeMenuTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setIsGroupMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!workflowId) return

    const ctrl = new AbortController()

    fetchEventSource(`/api/workflow/${workflowId}/stream`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: ctrl.signal,
      onmessage(event) {
        if (!event.data) return // 忽略空消息，防止 JSON.parse 报错
        try {
          const payload = JSON.parse(event.data)

          if (payload.type === 'connected') {
            setWorkflowStatus('running')
          } else if (payload.type === 'progress') {
            setWorkflowStatus('running')
            setProgressData(prev => ({ ...(prev || {}), ...payload.data }))
          } else if (payload.type === 'completed') {
            setWorkflowStatus('completed')
            if (payload.data) {
              const finalState = payload.data
              setProgressData(prev => {
                const newState: Record<string, any> = { ...(prev || {}) }
                // 根据映射表动态组装还原
                finalStateToNodeMap.forEach(({ stateKey, nodeKey }) => {
                  if (finalState[stateKey] !== undefined) {
                    newState[nodeKey] = { [stateKey]: finalState[stateKey] }
                  }
                })
                return newState
              })
            }
            ctrl.abort()
          } else if (payload.type === 'error') {
            message.error(payload.error || '执行出错')
            setWorkflowStatus('failed')
            ctrl.abort()
          }
        } catch (err) {
          console.error('SSE parsing error', err)
        }
      },
      onerror(err) {
        console.error('SSE Error:', err)
        ctrl.abort()
        throw err
      }
    })

    return () => ctrl.abort()
  }, [workflowId, token])

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <span className={styles.topBarTitle}>瑞幸夏日海报_v1</span>
        <SwitchTabs items={WORKSPACE_VIEW_TABS} defaultIndex={viewTabIndex} onChange={(i) => setViewTabIndex(i)} />
        <div className={styles.statusIndicator}>
          {workflowStatus === 'running' && <div className={styles.spinner} />}
          <span>{workflowStatus === 'completed' ? '已完成' : workflowStatus === 'failed' ? '已失败' : '运行中'}</span>
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
                <FlowView progressData={progressData} workflowStatus={workflowStatus} onNodeClick={handleNodeClick} />
              </ReactFlowProvider>
            </div>
          ) : (
            <CanvasPreview onSaveKnowledge={() => setIsSaveModalVisible(true)} />
          )}
        </section>

        <aside className={styles.right}>
          <div className={styles.rightHeader}>
            <span className={styles.panelTitle}>节点属性：知识库匹配</span>
          </div>
          <div className={styles.rightContent}>
            {/* ===== 标签区域 ===== */}
            <div className={styles.rightTagSection}>
              <h3 className={styles.rightSectionTitle}>基于意图自动命中的标签</h3>
              <div className={styles.tagList}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tagChip}>
                    <span className={styles.tagChipText}>{tag}</span>
                    <button
                      type="button"
                      className={styles.tagChipRemove}
                      onClick={() => {
                        setTags((prev) => prev.filter((t) => t !== tag))
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {isTagInputVisible ? (
                  <input
                    ref={tagInputRef}
                    className={styles.tagInputInline}
                    type="text"
                    placeholder="输入标签"
                    value={editingTagValue}
                    onChange={(e) => setEditingTagValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = editingTagValue.trim()
                        if (trimmed && !tags.includes(trimmed)) {
                          setTags((prev) => [...prev, trimmed])
                        }
                        setEditingTagValue('')
                        setIsTagInputVisible(false)
                      }
                      if (e.key === 'Escape') {
                        setEditingTagValue('')
                        setIsTagInputVisible(false)
                      }
                    }}
                    onBlur={() => {
                      setEditingTagValue('')
                      setIsTagInputVisible(false)
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.tagAddDashed}
                    onClick={() => {
                      setIsTagInputVisible(true)
                      setEditingTagValue('')
                    }}
                  >
                    + 添加标签
                  </button>
                )}
              </div>
            </div>

            {/* ===== 滑杆调节区 ===== */}
            <div className={styles.rightSliderSection}>
              <div className={styles.propSectionRow}>
                <span className={styles.sliderSectionLabel}>{SLIDER_CONFIG.label}</span>
                <span className={styles.sliderValue}>
                  {sliderValue}{SLIDER_CONFIG.unit}
                </span>
              </div>
              <input
                type="range"
                className={styles.slider}
                min={SLIDER_CONFIG.min}
                max={SLIDER_CONFIG.max}
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
              />
              <div className={styles.sliderRangeLabels}>
                <span>{SLIDER_CONFIG.rangeLabels[0]}</span>
                <span>{SLIDER_CONFIG.rangeLabels[1]}</span>
              </div>
            </div>

            {/* ===== 底部操作按钮 ===== */}
            <div className={styles.rightFooter}>
              <button type="button" className={styles.interceptBtn}>
                拦截并人工修改后续指令
              </button>
            </div>
          </div>
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
      
      <Drawer
        title={`节点执行详情 - ${selectedNodeId}`}
        placement="right"
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
        size="large"
      >
        {selectedNodeId && progressData ? (
          <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {selectedNodeId === 'compose' 
              ? '该节点属于图像生成后的自动排版流程，与生图引擎一并执行，无独立节点数据输出。'
              : (progressData[backendNodeKeyMap[selectedNodeId]]
                  ? JSON.stringify(progressData[backendNodeKeyMap[selectedNodeId]], null, 2)
                  : '该节点暂无详细数据 (可能还在排队、正在执行中，或者发生异常被跳过)')}
          </pre>
        ) : (
          <p>暂无数据</p>
        )}
      </Drawer>
    </div>
  )
}

export default Workspace
