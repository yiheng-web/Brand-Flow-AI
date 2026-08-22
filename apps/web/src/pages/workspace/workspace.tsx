import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DownloadOutlined,
  ExperimentOutlined,
  ExportOutlined,
  HeartOutlined,
  PlayCircleFilled,
  SaveOutlined,
} from '@ant-design/icons'
import type {
  CandidateImage,
  CreativeDirection,
  WorkflowNodeStatus,
  WorkflowResult,
} from '@brand-flow/contracts'
import {
  Button,
  Card,
  Checkbox,
  Image,
  Input,
  Modal,
  Progress,
  Radio,
  Space,
  Tag,
  Tooltip,
  message,
} from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'

import { createTrustedWorkVersion, createWork, exportWork, updateWorkFavorite } from '@/api/works'
import {
  getResultDownload,
  getWorkflowDetail,
  optimizeWorkflow,
  rerunNode,
  submitPrompt,
  updateNodeOutput,
} from '@/api/workflow'
import { StatusBadge, type SemanticStatus } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'
import { INITIAL_NODE_EXEC_STATUSES, useWorkflowStore } from '@/store/useWorkflowStore'
import { createAuthEventSource } from '@/utils/sse'

import FlowView from './components/FlowView'
import ArtTextComposer from './components/ArtTextComposer'
import BriefReviewPanel from './components/BriefReviewPanel'
import { FLOW_NODES, type FlowNodeId, type NodeExecStatus } from './workspace.const'
import styles from './workspace.module.css'

const NODE_ORDER = FLOW_NODES.map((node) => node.id)
const STATUS_MAP: Record<WorkflowNodeStatus, NodeExecStatus> = {
  pending: 'pending',
  queued: 'queued',
  running: 'running',
  completed: 'done',
  skipped: 'skipped',
  failed: 'failed',
  stale: 'stale',
}
const NODE_STATUS_MAP: Record<NodeExecStatus, SemanticStatus> = {
  unconfigured: 'unconfigured',
  ready: 'ready',
  pending: 'queued',
  queued: 'queued',
  running: 'running',
  done: 'success',
  warning: 'warning',
  failed: 'failed',
  skipped: 'skipped',
  stale: 'warning',
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export default function Workspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const navState = location.state as { prompt?: string; workflowId?: string } | null
  const currentSpaceId = useUserStore((state) => state.currentSpaceId) || 'personal'
  const currentSpaceType = useUserStore((state) => state.currentSpaceType)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const workflowStatus = useWorkflowStore((state) => state.status)
  const workflowPrompt = useWorkflowStore((state) => state.prompt)
  const workflowError = useWorkflowStore((state) => state.error)
  const result = useWorkflowStore((state) => state.result)
  const nodeExecStatuses = useWorkflowStore((state) => state.nodeExecStatuses)
  const nodeStreamData = useWorkflowStore((state) => state.nodeStreamData)
  const setWorkflowId = useWorkflowStore((state) => state.setWorkflowId)
  const setStatus = useWorkflowStore((state) => state.setStatus)
  const setPrompt = useWorkflowStore((state) => state.setPrompt)
  const setResult = useWorkflowStore((state) => state.setResult)
  const setError = useWorkflowStore((state) => state.setError)
  const setNodeExecStatuses = useWorkflowStore((state) => state.setNodeExecStatuses)
  const setNodeStreamData = useWorkflowStore((state) => state.setNodeStreamData)
  const [selectedNodeId, setSelectedNodeId] = useState<FlowNodeId>('brief')
  const [submitting, setSubmitting] = useState(false)
  const [savedWorkId, setSavedWorkId] = useState<string | null>(null)
  const [workflowSpaceId, setWorkflowSpaceId] = useState(currentSpaceId)
  const [awaitingAction, setAwaitingAction] = useState<string | undefined>()
  const [previewCandidateId, setPreviewCandidateId] = useState<string>('')
  const [promptOpen, setPromptOpen] = useState(false)
  const [feedbackCategories, setFeedbackCategories] = useState<string[]>([])
  const [feedbackInstruction, setFeedbackInstruction] = useState('')
  const connectionRef = useRef<{ close: () => void } | null>(null)
  const recoverRef = useRef<(workflowId: string) => Promise<void>>(async () => undefined)
  const recoveryTimerRef = useRef<number | null>(null)
  const initializedWorkflowRef = useRef<string | null>(null)
  const autoStartedRef = useRef(false)
  const userPrompt = navState?.prompt || workflowPrompt

  const connect = useCallback(
    (workflowId: string) => {
      connectionRef.current?.close()
      connectionRef.current = createAuthEventSource(`/api/workflow/${workflowId}/stream`, {
        onMessage: (event) => {
          if ('nodeType' in event) {
            const nodeType = event.nodeType as FlowNodeId
            if (event.type === 'node_queued')
              setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'queued' }))
            if (event.type === 'node_started')
              setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'running' }))
            if (event.type === 'node_failed') {
              setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'failed' }))
              setError(event.error.message)
            }
            if (event.type === 'node_skipped')
              setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'skipped' }))
            if (event.type === 'node_completed') {
              setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'done' }))
              if (isRecord(event.output))
                setNodeStreamData((old) => ({
                  ...old,
                  [nodeType]: event.output as Record<string, unknown>,
                }))
            }
          }
          if (event.type === 'workflow_awaiting_user') {
            setStatus('awaiting_user')
            setAwaitingAction(event.action)
            if (event.result) setResult(event.result)
            setSelectedNodeId(
              event.action === 'confirm_brief'
                ? 'brief'
                : event.action === 'select_direction'
                  ? 'creativeDirection'
                  : event.action === 'select_candidate'
                    ? 'generate'
                    : 'compose',
            )
            connectionRef.current?.close()
            connectionRef.current = null
          }
          if (event.type === 'workflow_completed') {
            setStatus('completed')
            setResult(event.result as WorkflowResult)
            connectionRef.current?.close()
            connectionRef.current = null
          }
          if (event.type === 'workflow_failed') {
            setStatus('failed')
            setError(event.error.message)
          }
        },
        onError: () => {
          message.warning('实时连接已断开，正在通过状态恢复保持数据一致')
          if (recoveryTimerRef.current !== null) return
          recoveryTimerRef.current = window.setTimeout(() => {
            recoveryTimerRef.current = null
            void recoverRef.current(workflowId)
          }, 1200)
        },
      })
    },
    [setError, setNodeExecStatuses, setNodeStreamData, setResult, setStatus],
  )

  const recover = useCallback(
    async (workflowId: string) => {
      try {
        const detail = await getWorkflowDetail(workflowId)
        setStatus(detail.workflow.status)
        setWorkflowSpaceId(detail.workflow.spaceId)
        setPrompt(detail.workflow.prompt)
        setResult(detail.workflow.result || null)
        setAwaitingAction(detail.workflow.awaitingAction)
        if (detail.workflow.status === 'awaiting_user') {
          setSelectedNodeId(
            detail.workflow.awaitingAction === 'confirm_brief'
              ? 'brief'
              : detail.workflow.awaitingAction === 'select_direction'
                ? 'creativeDirection'
                : detail.workflow.awaitingAction === 'select_candidate'
                  ? 'generate'
                  : 'compose',
          )
        }
        const statuses = { ...INITIAL_NODE_EXEC_STATUSES }
        const outputs: Record<string, Record<string, unknown>> = {}
        detail.nodes.forEach((node) => {
          statuses[node.type as FlowNodeId] = STATUS_MAP[node.status]
          if (node.output) outputs[node.type] = node.output
        })
        setNodeExecStatuses(statuses)
        setNodeStreamData(outputs)
        if (detail.workflow.status === 'pending' || detail.workflow.status === 'running')
          connect(workflowId)
      } catch (reason) {
        setStatus('failed')
        setError(reason instanceof Error ? reason.message : '无法恢复工作流')
      }
    },
    [connect, setError, setNodeExecStatuses, setNodeStreamData, setPrompt, setResult, setStatus],
  )

  const start = useCallback(async () => {
    if (!userPrompt.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    setNodeExecStatuses({ ...INITIAL_NODE_EXEC_STATUSES })
    setPrompt(userPrompt)
    try {
      const workflow = await submitPrompt({
        prompt: userPrompt,
        spaceId: currentSpaceId,
        spaceType: currentSpaceType,
      })
      initializedWorkflowRef.current = workflow.id
      setWorkflowId(workflow.id)
      setWorkflowSpaceId(workflow.spaceId)
      setStatus('running')
      connect(workflow.id)
    } catch (reason) {
      setStatus('failed')
      setError(reason instanceof Error ? reason.message : '创建工作流失败')
    } finally {
      setSubmitting(false)
    }
  }, [
    connect,
    currentSpaceId,
    currentSpaceType,
    setError,
    setNodeExecStatuses,
    setPrompt,
    setStatus,
    setWorkflowId,
    submitting,
    userPrompt,
  ])

  useEffect(() => {
    recoverRef.current = recover
  }, [recover])

  useEffect(() => {
    const id = navState?.workflowId || workflowId
    queueMicrotask(() => {
      if (id && initializedWorkflowRef.current !== id) {
        initializedWorkflowRef.current = id
        setWorkflowId(id)
        void recover(id)
      } else if (!id && navState?.prompt && workflowStatus === 'idle' && !autoStartedRef.current) {
        autoStartedRef.current = true
        void start()
      }
    })
  }, [
    navState?.prompt,
    navState?.workflowId,
    recover,
    setWorkflowId,
    start,
    workflowId,
    workflowStatus,
  ])

  useEffect(
    () => () => {
      connectionRef.current?.close()
      connectionRef.current = null
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current)
    },
    [],
  )

  const generate = result?.generate
  const previewCandidate =
    generate?.candidates.find((candidate) => candidate.id === previewCandidateId) ||
    generate?.candidates.find((candidate) => candidate.id === generate.selectedCandidateId) ||
    generate?.candidates[0]
  const selectDirection = async (direction: CreativeDirection) => {
    if (!workflowId || !result?.creativeDirection) return
    const nextCreativeDirection = {
      ...result.creativeDirection,
      selectedDirectionId: direction.id,
    }
    await updateNodeOutput(
      workflowId,
      'creativeDirection',
      nextCreativeDirection as unknown as Record<string, unknown>,
    )
    setResult({ ...result, creativeDirection: nextCreativeDirection })
    await rerunNode(workflowId, 'prompt')
    setStatus('running')
    connect(workflowId)
  }
  const selectCandidate = async (candidate: CandidateImage) => {
    if (!workflowId || !generate) return
    const nextGenerate = { ...generate, selectedCandidateId: candidate.id }
    await updateNodeOutput(
      workflowId,
      'generate',
      nextGenerate as unknown as Record<string, unknown>,
    )
    setResult({
      ...result,
      generate: nextGenerate,
      compositionDraft: undefined,
      compose: undefined,
      finalEvaluation: undefined,
      finalImageUrl: undefined,
    })
    setNodeExecStatuses((old) => ({
      ...old,
      generate: 'done',
      compose: 'stale',
      finalEvaluation: 'stale',
    }))
    setSelectedNodeId('compose')
    await recover(workflowId)
    if (result?.brief?.needsComposition) {
      setSelectedNodeId('compose')
      message.success('已选择候选底图，请继续输入艺术字内容')
    } else {
      await rerunNode(workflowId, 'compose')
      setStatus('running')
      connect(workflowId)
      message.success('已选择候选底图，正在执行最终质检')
    }
  }
  const rerun = async () => {
    if (!workflowId) return
    await rerunNode(workflowId, selectedNodeId)
    setStatus('running')
    connect(workflowId)
  }
  const saveWork = async (): Promise<string | null> => {
    if (!workflowId || !result?.finalImageUrl || !result.finalEvaluation) return null
    if (savedWorkId) {
      await createTrustedWorkVersion(savedWorkId, workflowId)
      message.success('作品新版本已保存')
      return savedWorkId
    }
    const work = await createWork({
      title: userPrompt.slice(0, 40) || '未命名作品',
      spaceId: workflowSpaceId,
      finalImageUrl: result.finalImageUrl,
      objectKey:
        result.compose && 'objectKey' in result.compose ? result.compose.objectKey : undefined,
      workflowId,
      qualityReport: result.finalEvaluation,
      nodesSnapshot: nodeStreamData,
      metadata: {
        selectedCandidateId: result.generate?.selectedCandidateId,
        artText: result.compositionDraft,
        composition: result.compose,
      },
    })
    setSavedWorkId(work._id)
    message.success('作品与初始版本已保存')
    return work._id
  }
  const formalExport = async () => {
    if (!savedWorkId) return
    const exported = await exportWork(savedWorkId)
    const a = document.createElement('a')
    a.href = exported.downloadUrl
    a.download = exported.fileName
    a.click()
  }
  const completed = NODE_ORDER.filter((id) =>
    ['done', 'skipped'].includes(nodeExecStatuses[id]),
  ).length
  const semantic: SemanticStatus =
    workflowStatus === 'completed'
      ? 'success'
      : workflowStatus === 'failed'
        ? 'failed'
        : workflowStatus === 'running'
          ? 'running'
          : 'queued'
  const selectedOutput = nodeStreamData[selectedNodeId]
  const baseCandidate = generate?.candidates.find(
    (candidate) => candidate.id === generate.selectedCandidateId,
  )
  const downloadResult = async () => {
    if (!workflowId) return
    const download = await getResultDownload(workflowId)
    const link = document.createElement('a')
    link.href = download.downloadUrl
    link.download = download.fileName
    link.click()
  }
  const favoriteResult = async () => {
    const workId = savedWorkId || (await saveWork())
    if (!workId) return
    await updateWorkFavorite(workId, true)
    message.success('已收藏到作品中心')
  }
  const submitOptimization = async () => {
    if (!workflowId || !previewCandidate || !feedbackInstruction.trim()) {
      message.warning('请选择图片并输入优化要求')
      return
    }
    await optimizeWorkflow(workflowId, {
      categories: feedbackCategories as Array<
        'style' | 'color' | 'subject' | 'composition' | 'text'
      >,
      instruction: feedbackInstruction.trim(),
      sourceCandidateId: previewCandidate.id,
    })
    setStatus('running')
    setFeedbackInstruction('')
    setFeedbackCategories([])
    connect(workflowId)
    message.success('已保留品牌定位与主体，正在生成新一轮候选图')
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.workspaceTopBar}>
        <div className={styles.workflowIdentity}>
          <span className={styles.eyebrow}>
            <i className={styles.liveDot} />
            AI 创作工作流
          </span>
          <strong className={styles.workflowTitle}>{userPrompt || '未命名工作流'}</strong>
          {import.meta.env.VITE_BRAND_FLOW_DEMO_MODE === 'true' && (
            <Tag color="orange">演示模式</Tag>
          )}
        </div>
        <div className={styles.workspaceActions}>
          <Button
            icon={<SaveOutlined />}
            disabled={!result?.finalImageUrl || !result.finalEvaluation?.passed}
            onClick={saveWork}
          >
            保存作品
          </Button>
          <Button
            onClick={() => savedWorkId && navigate(`/works/${savedWorkId}`)}
            disabled={!savedWorkId}
          >
            查看作品
          </Button>
          <Button icon={<ExportOutlined />} disabled={!savedWorkId} onClick={formalExport}>
            正式导出
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleFilled />}
            loading={submitting}
            disabled={!userPrompt.trim() || workflowStatus === 'running'}
            onClick={start}
          >
            运行工作流
          </Button>
        </div>
      </header>
      <nav className={styles.nodeStepper} aria-label="工作流节点">
        {FLOW_NODES.map((node) => {
          const nodeStatus = nodeExecStatuses[node.id]
          const completedNode = ['done', 'skipped'].includes(nodeStatus)
          return (
            <button
              key={node.id}
              type="button"
              className={[
                styles.libraryNode,
                selectedNodeId === node.id ? styles.libraryNodeActive : '',
                completedNode ? styles.libraryNodeDone : '',
              ].join(' ')}
              aria-current={selectedNodeId === node.id ? 'step' : undefined}
              onClick={() => setSelectedNodeId(node.id)}
            >
              <span className={styles.libraryStep}>{completedNode ? '✓' : node.step}</span>
              <span className={styles.libraryText}>
                <strong>{node.title}</strong>
                <small>{node.subtitle}</small>
              </span>
            </button>
          )
        })}
      </nav>
      <div className={styles.workspaceBody}>
        <section className={styles.center}>
          <div className={styles.canvasArea}>
            <ReactFlowProvider>
              <FlowView
                onNodeClick={(id) => setSelectedNodeId(id as FlowNodeId)}
                nodeExecStatuses={nodeExecStatuses}
              />
            </ReactFlowProvider>
            {selectedNodeId === 'compose' && workflowId && baseCandidate && (
              <div className={styles.composerOverlay}>
                <ArtTextComposer
                  key={baseCandidate.id}
                  workflowId={workflowId}
                  baseCandidate={baseCandidate}
                  draft={result?.compositionDraft}
                  onChanged={() => recover(workflowId)}
                />
              </div>
            )}
          </div>
        </section>
        <aside className={styles.right}>
          <div className={styles.rightHeader}>
            <span className={styles.aiMark}>
              <ExperimentOutlined />
            </span>
            <div className={styles.aiHeading}>
              <span className={styles.eyebrow}>AI 工作栏</span>
              <span className={styles.panelTitle}>
                {FLOW_NODES.find((node) => node.id === selectedNodeId)?.title}
              </span>
            </div>
          </div>
          <div className={styles.inspectorContent}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <StatusBadge
                status={NODE_STATUS_MAP[nodeExecStatuses[selectedNodeId]] ?? 'unconfigured'}
              />
              {selectedNodeId === 'brief' && result?.brief && workflowId ? (
                <BriefReviewPanel
                  key={result.briefReview?.version ?? 1}
                  workflowId={workflowId}
                  brief={result.brief}
                  awaitingConfirmation={awaitingAction === 'confirm_brief'}
                  onChanged={() => recover(workflowId)}
                />
              ) : selectedNodeId === 'creativeDirection' && result?.creativeDirection ? (
                <Radio.Group value={result.creativeDirection.selectedDirectionId}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {result.creativeDirection.directions.map((direction) => (
                      <Card key={direction.id} size="small">
                        <Radio
                          value={direction.id}
                          onChange={() => void selectDirection(direction)}
                        >
                          {direction.name || direction.title}
                        </Radio>
                        <p>{direction.concept || direction.summary}</p>
                        <p>
                          <strong>推荐：</strong>
                          {direction.reason}
                        </p>
                        <p>
                          <strong>风险：</strong>
                          {direction.risk}
                        </p>
                        <Space wrap>
                          {(direction.visualKeywords || [direction.visualStyle]).map((keyword) => (
                            <Tag key={keyword}>{keyword}</Tag>
                          ))}
                        </Space>
                      </Card>
                    ))}
                  </Space>
                </Radio.Group>
              ) : selectedNodeId === 'generate' && generate ? (
                <>
                  {previewCandidate?.imageUrl && (
                    <Card cover={<Image src={previewCandidate.imageUrl} alt="当前预览图片" />}>
                      <Space wrap>
                        <Button icon={<DownloadOutlined />} onClick={() => void downloadResult()}>
                          下载
                        </Button>
                        <Button onClick={() => setPromptOpen(true)}>查看 Prompt</Button>
                        <Button icon={<HeartOutlined />} onClick={() => void favoriteResult()}>
                          收藏
                        </Button>
                      </Space>
                    </Card>
                  )}
                  <Radio.Group value={generate.selectedCandidateId}>
                    <div className={styles.candidateGrid}>
                      {generate.candidates.map((candidate) => {
                        const evaluation = generate.evaluations.find(
                          (item) => item.candidateId === candidate.id,
                        )
                        return (
                          <Card
                            key={candidate.id}
                            size="small"
                            cover={
                              candidate.imageUrl ? (
                                <Image preview={false} src={candidate.imageUrl} alt="候选图" />
                              ) : undefined
                            }
                          >
                            <Button type="link" onClick={() => setPreviewCandidateId(candidate.id)}>
                              预览此图
                            </Button>
                            <Radio
                              value={candidate.id}
                              disabled={!evaluation || evaluation.totalScore < 6}
                              onChange={() => void selectCandidate(candidate)}
                            >
                              {evaluation && evaluation.totalScore < 6 ? '质检未通过' : '选择'} ·{' '}
                              {evaluation?.totalScore ?? '未评分'}分
                            </Radio>
                          </Card>
                        )
                      })}
                    </div>
                  </Radio.Group>
                  <Tooltip title="选择候选图后从合成节点重跑">
                    <span />
                  </Tooltip>
                  <Card size="small" title="继续优化">
                    <Checkbox.Group
                      value={feedbackCategories}
                      onChange={(values) => setFeedbackCategories(values as string[])}
                      options={[
                        { label: '风格不满意', value: 'style' },
                        { label: '色彩调整', value: 'color' },
                        { label: '主体错误', value: 'subject' },
                        { label: '构图调整', value: 'composition' },
                        { label: '文字错误', value: 'text' },
                      ]}
                    />
                    <Input.TextArea
                      value={feedbackInstruction}
                      onChange={(event) => setFeedbackInstruction(event.target.value)}
                      placeholder="例如：背景改成夜景，增加科技感"
                      autoSize={{ minRows: 2, maxRows: 4 }}
                    />
                    <Button type="primary" onClick={() => void submitOptimization()}>
                      保持品牌与主体并重新生成
                    </Button>
                  </Card>
                  <Modal
                    open={promptOpen}
                    footer={null}
                    onCancel={() => setPromptOpen(false)}
                    title="当前 Prompt"
                  >
                    <p>{result.prompt?.imagePrompt}</p>
                    <p>
                      <strong>负向 Prompt：</strong>
                      {result.prompt?.negativePrompt || '无'}
                    </p>
                  </Modal>
                </>
              ) : (
                <pre className={styles.outputPreview}>
                  {JSON.stringify(selectedOutput || {}, null, 2)}
                </pre>
              )}
              <Button
                onClick={() => void rerun()}
                disabled={!workflowId || workflowStatus === 'running'}
              >
                从此节点重跑
              </Button>
            </Space>
          </div>
        </aside>
      </div>
      <footer className={styles.executionBar} aria-live="polite">
        <div className={styles.executionStatus}>
          <StatusBadge status={semantic} />
          <span>{workflowError || workflowStatus}</span>
        </div>
        <div className={styles.executionProgress}>
          <span>整体进度</span>
          <Progress percent={Math.round((completed / 7) * 100)} showInfo={false} />
          <strong>{completed}/7</strong>
        </div>
      </footer>
    </div>
  )
}
