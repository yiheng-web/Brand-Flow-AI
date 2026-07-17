import { useCallback, useEffect, useRef, useState } from 'react'
import { ExportOutlined, PlayCircleFilled, SaveOutlined } from '@ant-design/icons'
import type { CandidateImage, WorkflowNodeStatus, WorkflowResult } from '@brand-flow/contracts'
import { Button, Card, Image, Progress, Radio, Space, Tag, Tooltip, message } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'

import { createWork, exportWork } from '@/api/works'
import { getWorkflowDetail, rerunNode, submitPrompt, updateNodeOutput } from '@/api/workflow'
import { StatusBadge, type SemanticStatus } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'
import { INITIAL_NODE_EXEC_STATUSES, useWorkflowStore } from '@/store/useWorkflowStore'
import { createAuthEventSource } from '@/utils/sse'

import FlowView from './components/FlowView'
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export default function Workspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const navState = location.state as { prompt?: string; workflowId?: string } | null
  const currentSpaceId = useUserStore((state) => state.currentSpaceId) || 'personal'
  const currentSpaceType = useUserStore((state) => state.currentSpaceType)
  const store = useWorkflowStore()
  const [selectedNodeId, setSelectedNodeId] = useState<FlowNodeId>('brief')
  const [submitting, setSubmitting] = useState(false)
  const [savedWorkId, setSavedWorkId] = useState<string | null>(null)
  const connectionRef = useRef<{ close: () => void } | null>(null)
  const userPrompt = navState?.prompt || store.prompt

  const connect = useCallback(
    (workflowId: string) => {
      connectionRef.current?.close()
      connectionRef.current = createAuthEventSource(`/api/workflow/${workflowId}/stream`, {
        onMessage: (event) => {
          if ('nodeType' in event) {
            const nodeType = event.nodeType as FlowNodeId
            if (event.type === 'node_queued')
              store.setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'queued' }))
            if (event.type === 'node_started')
              store.setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'running' }))
            if (event.type === 'node_failed') {
              store.setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'failed' }))
              store.setError(event.error.message)
            }
            if (event.type === 'node_skipped')
              store.setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'skipped' }))
            if (event.type === 'node_completed') {
              store.setNodeExecStatuses((old) => ({ ...old, [nodeType]: 'done' }))
              if (isRecord(event.output))
                store.setNodeStreamData((old) => ({
                  ...old,
                  [nodeType]: event.output as Record<string, unknown>,
                }))
            }
          }
          if (event.type === 'workflow_completed') {
            store.setStatus('completed')
            store.setResult(event.result as WorkflowResult)
            connectionRef.current?.close()
            connectionRef.current = null
          }
          if (event.type === 'workflow_failed') {
            store.setStatus('failed')
            store.setError(event.error.message)
          }
        },
        onError: () => message.warning('实时连接已断开，正在通过状态恢复保持数据一致'),
      })
    },
    [store],
  )

  const recover = useCallback(
    async (workflowId: string) => {
      try {
        const detail = await getWorkflowDetail(workflowId)
        store.setStatus(detail.workflow.status)
        store.setPrompt(detail.workflow.prompt)
        store.setResult(detail.workflow.result || null)
        const statuses = { ...INITIAL_NODE_EXEC_STATUSES }
        const outputs: Record<string, Record<string, unknown>> = {}
        detail.nodes.forEach((node) => {
          statuses[node.type as FlowNodeId] = STATUS_MAP[node.status]
          if (node.output) outputs[node.type] = node.output
        })
        store.setNodeExecStatuses(statuses)
        store.setNodeStreamData(outputs)
        if (detail.workflow.status === 'pending' || detail.workflow.status === 'running')
          connect(workflowId)
      } catch (reason) {
        store.setStatus('failed')
        store.setError(reason instanceof Error ? reason.message : '无法恢复工作流')
      }
    },
    [connect, store],
  )

  const start = useCallback(async () => {
    if (!userPrompt.trim() || submitting) return
    setSubmitting(true)
    store.setError(null)
    store.setNodeExecStatuses({ ...INITIAL_NODE_EXEC_STATUSES })
    store.setPrompt(userPrompt)
    try {
      const workflow = await submitPrompt({
        prompt: userPrompt,
        spaceId: currentSpaceId,
        spaceType: currentSpaceType,
      })
      store.setWorkflowId(workflow.id)
      store.setStatus('running')
      connect(workflow.id)
    } catch (reason) {
      store.setStatus('failed')
      store.setError(reason instanceof Error ? reason.message : '创建工作流失败')
    } finally {
      setSubmitting(false)
    }
  }, [connect, currentSpaceId, currentSpaceType, store, submitting, userPrompt])

  useEffect(() => {
    const id = navState?.workflowId || store.workflowId
    queueMicrotask(() => {
      if (id) {
        store.setWorkflowId(id)
        void recover(id)
      } else if (navState?.prompt && store.status === 'idle') void start()
    })
    return () => connectionRef.current?.close()
  }, [navState?.prompt, navState?.workflowId, recover, start, store])

  const result = store.result
  const generate = result?.generate
  const selectCandidate = async (candidate: CandidateImage) => {
    if (!store.workflowId || !generate) return
    const nextGenerate = { ...generate, selectedCandidateId: candidate.id }
    await updateNodeOutput(
      store.workflowId,
      'generate',
      nextGenerate as unknown as Record<string, unknown>,
    )
    store.setResult({
      ...result,
      generate: nextGenerate,
      compose: undefined,
      finalEvaluation: undefined,
      finalImageUrl: undefined,
    })
    store.setNodeExecStatuses((old) => ({
      ...old,
      generate: 'done',
      compose: 'stale',
      finalEvaluation: 'stale',
    }))
    message.success('已选择候选图，可从合成节点继续运行')
  }
  const rerun = async () => {
    if (!store.workflowId) return
    await rerunNode(store.workflowId, selectedNodeId)
    store.setStatus('running')
    connect(store.workflowId)
  }
  const saveWork = async () => {
    if (!store.workflowId || !result?.finalImageUrl || !result.finalEvaluation) return
    const work = await createWork({
      title: userPrompt.slice(0, 40) || '未命名作品',
      spaceId: currentSpaceId,
      finalImageUrl: result.finalImageUrl,
      workflowId: store.workflowId,
      qualityReport: result.finalEvaluation,
      nodesSnapshot: store.nodeStreamData,
      metadata: { selectedCandidateId: result.generate?.selectedCandidateId },
    })
    setSavedWorkId(work._id)
    message.success('作品与初始版本已保存')
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
    ['done', 'skipped'].includes(store.nodeExecStatuses[id]),
  ).length
  const semantic: SemanticStatus =
    store.status === 'completed'
      ? 'success'
      : store.status === 'failed'
        ? 'failed'
        : store.status === 'running'
          ? 'running'
          : 'queued'
  const selectedOutput = store.nodeStreamData[selectedNodeId]

  return (
    <div className={styles.wrapper}>
      <header className={styles.workspaceTopBar}>
        <div className={styles.workflowIdentity}>
          <span className={styles.eyebrow}>AI 创作工作流</span>
          <strong className={styles.workflowTitle}>{userPrompt || '未命名工作流'}</strong>
          {import.meta.env.VITE_BRAND_FLOW_DEMO_MODE === 'true' && (
            <Tag color="orange">演示模式</Tag>
          )}
        </div>
        <div className={styles.workspaceActions}>
          <Button icon={<SaveOutlined />} disabled={!result?.finalImageUrl} onClick={saveWork}>
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
            disabled={!userPrompt.trim() || store.status === 'running'}
            onClick={start}
          >
            运行工作流
          </Button>
        </div>
      </header>
      <div className={styles.workspaceBody}>
        <aside className={styles.resourcePanel}>
          <div className={styles.resourceHeader}>
            <div>
              <span className={styles.eyebrow}>资源与节点</span>
              <h2>七节点工作流</h2>
            </div>
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
        </aside>
        <section className={styles.center}>
          <div className={styles.canvasArea}>
            <ReactFlowProvider>
              <FlowView
                onNodeClick={(id) => setSelectedNodeId(id as FlowNodeId)}
                nodeExecStatuses={store.nodeExecStatuses}
              />
            </ReactFlowProvider>
          </div>
        </section>
        <aside className={styles.right}>
          <div className={styles.rightHeader}>
            <div>
              <span className={styles.eyebrow}>Inspector</span>
              <span className={styles.panelTitle}>
                {FLOW_NODES.find((node) => node.id === selectedNodeId)?.title}
              </span>
            </div>
          </div>
          <div style={{ padding: 16, overflow: 'auto' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <StatusBadge
                status={
                  store.nodeExecStatuses[selectedNodeId] === 'done'
                    ? 'success'
                    : (store.nodeExecStatuses[selectedNodeId] as SemanticStatus)
                }
              />
              {selectedNodeId === 'generate' && generate ? (
                <>
                  <Radio.Group value={generate.selectedCandidateId}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                            <Radio
                              value={candidate.id}
                              onChange={() => void selectCandidate(candidate)}
                            >
                              选择 · {evaluation?.totalScore ?? '未评分'}分
                            </Radio>
                          </Card>
                        )
                      })}
                    </div>
                  </Radio.Group>
                  <Tooltip title="选择候选图后从合成节点重跑">
                    <span />
                  </Tooltip>
                </>
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(selectedOutput || {}, null, 2)}
                </pre>
              )}
              <Button
                onClick={() => void rerun()}
                disabled={!store.workflowId || store.status === 'running'}
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
          <span>{store.error || store.status}</span>
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
