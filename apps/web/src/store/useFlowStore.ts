import { create } from 'zustand'

import {
  WORKFLOW_NODE_IDS,
  type BrandAsset,
  type ComposeLayer,
  type EvaluationReport,
  type ImageRatio,
  type NodeResultMap,
  type NodeStatus,
  type SceneType,
  type WorkflowNodeId,
  type WorkflowSessionContext,
  type WorkflowStatus,
} from '@brand-flow/common'

export type {
  BrandAsset,
  ComposeLayer,
  EvaluationReport,
  NodeResultMap,
  NodeStatus,
  WorkflowNodeId,
  WorkflowSessionContext,
}

const DEFAULT_NODE_STATES: Record<WorkflowNodeId, NodeStatus> = {
  intent: 'PENDING',
  'brand-kb': 'PENDING',
  prompt: 'PENDING',
  'image-gen': 'PENDING',
  compose: 'PENDING',
  eval: 'PENDING',
}

const DEFAULT_ASSETS: BrandAsset[] = [
  {
    id: 'brand-blue',
    type: 'color',
    label: '品牌蓝 #0B57D0',
    value: '#0b57d0',
    selected: true,
  },
  {
    id: 'logo-primary',
    type: 'logo',
    label: '标准 Logo',
    value: 'brand-logo-primary.svg',
    selected: true,
  },
]

const DEFAULT_LAYERS: ComposeLayer[] = [
  {
    id: 'base-image',
    type: 'image',
    label: '生成底图',
    x: 0,
    y: 0,
    width: 1024,
    height: 1024,
    opacity: 1,
    url: '',
  },
  {
    id: 'headline',
    type: 'text',
    label: '主标题',
    x: 512,
    y: 120,
    width: 620,
    height: 96,
    opacity: 1,
    content: 'SUMMER ICE',
  },
]

export interface TaskConfig {
  sceneType?: SceneType
  imageRatio?: ImageRatio
  useKnowledge?: boolean
  spaceId?: string
  scope?: 'personal' | 'team'
}

interface FlowState {
  workflowId: string | null
  activeNodeId: WorkflowNodeId
  prompt: string
  workflowStatus: WorkflowStatus | null
  errorMessage: string | null
  nodeStates: Record<WorkflowNodeId, NodeStatus>
  nodeResults: NodeResultMap
  sessionContext: WorkflowSessionContext
  streamMessages: string[]
  setWorkflow: (workflowId: string | null, prompt?: string) => void
  setWorkflowStatus: (status: WorkflowStatus | null, errorMessage?: string | null) => void
  setTaskConfig: (config: TaskConfig) => void
  setActiveNode: (id: WorkflowNodeId) => void
  setNodeStatus: (id: WorkflowNodeId, status: NodeStatus) => void
  updateTags: (tags: string[]) => void
  updateBrandAssets: (assets: BrandAsset[]) => void
  updatePromptResult: (positivePrompt: string, negativePrompt: string) => void
  updateGenerationSettings: (settings: { imageModel?: string; imageSize?: string }) => void
  applyServerState: (payload: unknown) => void
  appendStreamMessage: (message: string) => void
  resetDownstream: (fromNodeId: WorkflowNodeId) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resetDownstreamStates(
  current: Record<WorkflowNodeId, NodeStatus>,
  fromNodeId: WorkflowNodeId,
): Record<WorkflowNodeId, NodeStatus> {
  const fromIndex = WORKFLOW_NODE_IDS.indexOf(fromNodeId)

  return WORKFLOW_NODE_IDS.reduce<Record<WorkflowNodeId, NodeStatus>>(
    (next, nodeId, index) => {
      next[nodeId] = index > fromIndex ? 'PENDING' : current[nodeId]
      return next
    },
    {} as Record<WorkflowNodeId, NodeStatus>,
  )
}

function mergeEvaluationReport(data: Record<string, unknown>): EvaluationReport | undefined {
  if (isRecord(data.evaluationReport)) {
    return data.evaluationReport as unknown as EvaluationReport
  }
  if (isRecord(data.eval)) {
    return data.eval as unknown as EvaluationReport
  }
  if (typeof data.score === 'number' && typeof data.passed === 'boolean') {
    return data as unknown as EvaluationReport
  }
  return undefined
}

export const useFlowStore = create<FlowState>((set) => ({
  workflowId: null,
  activeNodeId: 'intent',
  prompt: '',
  workflowStatus: null,
  errorMessage: null,
  nodeStates: { ...DEFAULT_NODE_STATES },
  nodeResults: {
    intent: { tags: ['夏日海报', '冰爽感', '咖啡', '阳光'] },
    'brand-kb': { brandAssets: DEFAULT_ASSETS },
    compose: { layers: DEFAULT_LAYERS },
  },
  sessionContext: {
    tags: ['夏日海报', '冰爽感', '咖啡', '阳光'],
    brandAssets: DEFAULT_ASSETS,
    imageModel: 'Flux.1 [Snel]',
    imageSize: '3:4',
    headline: 'SUMMER ICE',
  },
  streamMessages: [],

  setWorkflow: (workflowId, prompt = '') =>
    set((state) => ({
      workflowId,
      prompt,
      sessionContext: { ...state.sessionContext, prompt },
    })),

  setWorkflowStatus: (workflowStatus, errorMessage = null) => set({ workflowStatus, errorMessage }),

  setTaskConfig: (config) =>
    set((state) => ({
      sessionContext: {
        ...state.sessionContext,
        sceneType: config.sceneType ?? state.sessionContext.sceneType,
        imageRatio: config.imageRatio ?? state.sessionContext.imageRatio,
        imageSize: config.imageRatio ?? state.sessionContext.imageSize,
        useKnowledge: config.useKnowledge ?? state.sessionContext.useKnowledge,
        spaceId: config.spaceId ?? state.sessionContext.spaceId,
        scope: config.scope ?? state.sessionContext.scope,
      },
    })),

  setActiveNode: (activeNodeId) => set({ activeNodeId }),

  setNodeStatus: (id, status) =>
    set((state) => ({ nodeStates: { ...state.nodeStates, [id]: status } })),

  updateTags: (tags) =>
    set((state) => ({
      nodeResults: {
        ...state.nodeResults,
        intent: { ...state.nodeResults.intent, tags },
      },
      sessionContext: { ...state.sessionContext, tags },
    })),

  updateBrandAssets: (assets) =>
    set((state) => ({
      nodeResults: {
        ...state.nodeResults,
        'brand-kb': { ...state.nodeResults['brand-kb'], brandAssets: assets },
      },
      sessionContext: { ...state.sessionContext, brandAssets: assets },
    })),

  updatePromptResult: (positivePrompt, negativePrompt) =>
    set((state) => ({
      nodeResults: {
        ...state.nodeResults,
        prompt: { ...state.nodeResults.prompt, positivePrompt, negativePrompt },
      },
      sessionContext: { ...state.sessionContext, positivePrompt, negativePrompt },
    })),

  updateGenerationSettings: (settings) =>
    set((state) => ({ sessionContext: { ...state.sessionContext, ...settings } })),

  applyServerState: (payload) => {
    if (!isRecord(payload)) return

    const root = payload
    const data = isRecord(payload.data) ? payload.data : payload
    const result = isRecord(root.result) ? root.result : isRecord(data.result) ? data.result : null
    const merged = { ...data, ...(result ?? {}) }

    const activeNodeId =
      typeof merged.activeNodeId === 'string' ? (merged.activeNodeId as WorkflowNodeId) : undefined
    const workflowStatus =
      typeof root.status === 'string'
        ? (root.status as WorkflowStatus)
        : typeof merged.status === 'string'
          ? (merged.status as WorkflowStatus)
          : undefined
    const errorMessage =
      typeof root.errorMessage === 'string'
        ? root.errorMessage
        : typeof merged.errorMessage === 'string'
          ? merged.errorMessage
          : null

    const evalReport = mergeEvaluationReport(merged)

    set((state) => ({
      prompt: typeof root.prompt === 'string' ? root.prompt : state.prompt,
      workflowStatus: workflowStatus ?? state.workflowStatus,
      errorMessage: errorMessage ?? state.errorMessage,
      activeNodeId: activeNodeId ?? state.activeNodeId,
      nodeStates: isRecord(merged.nodeStates)
        ? ({ ...state.nodeStates, ...merged.nodeStates } as Record<WorkflowNodeId, NodeStatus>)
        : state.nodeStates,
      sessionContext: isRecord(merged.sessionContext)
        ? { ...state.sessionContext, ...(merged.sessionContext as WorkflowSessionContext) }
        : { ...state.sessionContext, ...(merged as WorkflowSessionContext) },
      nodeResults: {
        ...state.nodeResults,
        intent: {
          ...state.nodeResults.intent,
          tags: Array.isArray(merged.tags)
            ? (merged.tags as string[])
            : state.nodeResults.intent?.tags,
          sceneType:
            typeof merged.sceneType === 'string'
              ? (merged.sceneType as SceneType)
              : state.nodeResults.intent?.sceneType,
        },
        'brand-kb': {
          ...state.nodeResults['brand-kb'],
          knowledgeContext:
            typeof merged.knowledgeContext === 'string'
              ? merged.knowledgeContext
              : state.nodeResults['brand-kb']?.knowledgeContext,
          matchedSummary:
            typeof merged.matchedSummary === 'string'
              ? merged.matchedSummary
              : state.nodeResults['brand-kb']?.matchedSummary,
          useKnowledge:
            typeof merged.useKnowledge === 'boolean'
              ? merged.useKnowledge
              : state.nodeResults['brand-kb']?.useKnowledge,
          brandAssets: Array.isArray(merged.brandAssets)
            ? (merged.brandAssets as BrandAsset[])
            : state.nodeResults['brand-kb']?.brandAssets,
        },
        prompt: {
          ...state.nodeResults.prompt,
          positivePrompt:
            typeof merged.positivePrompt === 'string'
              ? merged.positivePrompt
              : state.nodeResults.prompt?.positivePrompt,
          negativePrompt:
            typeof merged.negativePrompt === 'string'
              ? merged.negativePrompt
              : state.nodeResults.prompt?.negativePrompt,
          finalPrompt:
            typeof merged.finalPrompt === 'string'
              ? merged.finalPrompt
              : state.nodeResults.prompt?.finalPrompt,
        },
        'image-gen': {
          ...state.nodeResults['image-gen'],
          baseImageUrl:
            typeof merged.baseImageUrl === 'string'
              ? merged.baseImageUrl
              : state.nodeResults['image-gen']?.baseImageUrl,
          imageParams: isRecord(merged.imageParams)
            ? {
                model: String(merged.imageParams.model ?? ''),
                size: String(merged.imageParams.size ?? ''),
                seed:
                  typeof merged.imageParams.seed === 'number' ? merged.imageParams.seed : undefined,
              }
            : state.nodeResults['image-gen']?.imageParams,
        },
        compose: {
          ...state.nodeResults.compose,
          finalImageUrl:
            typeof merged.finalImageUrl === 'string'
              ? merged.finalImageUrl
              : state.nodeResults.compose?.finalImageUrl,
          layers: Array.isArray(merged.layers)
            ? (merged.layers as ComposeLayer[])
            : state.nodeResults.compose?.layers,
        },
        eval: evalReport ?? state.nodeResults.eval,
      },
    }))
  },

  appendStreamMessage: (message) =>
    set((state) => ({ streamMessages: [...state.streamMessages.slice(-20), message] })),

  resetDownstream: (fromNodeId) =>
    set((state) => ({
      nodeStates: resetDownstreamStates(state.nodeStates, fromNodeId),
    })),
}))
