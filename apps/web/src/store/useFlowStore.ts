import { create } from 'zustand'

import {
  WORKFLOW_NODE_IDS,
  type BrandAsset,
  type ComposeLayer,
  type EvaluationReport,
  type NodeResultMap,
  type NodeStatus,
  type WorkflowNodeId,
  type WorkflowSessionContext,
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

interface FlowState {
  workflowId: string | null
  activeNodeId: WorkflowNodeId
  prompt: string
  nodeStates: Record<WorkflowNodeId, NodeStatus>
  nodeResults: NodeResultMap
  sessionContext: WorkflowSessionContext
  streamMessages: string[]
  setWorkflow: (workflowId: string | null, prompt?: string) => void
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

export const useFlowStore = create<FlowState>((set) => ({
  workflowId: null,
  activeNodeId: 'intent',
  prompt: '',
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

    const data = isRecord(payload.data) ? payload.data : payload
    const activeNodeId =
      typeof data.activeNodeId === 'string' ? (data.activeNodeId as WorkflowNodeId) : undefined

    set((state) => ({
      activeNodeId: activeNodeId ?? state.activeNodeId,
      nodeStates: isRecord(data.nodeStates)
        ? ({ ...state.nodeStates, ...data.nodeStates } as Record<WorkflowNodeId, NodeStatus>)
        : state.nodeStates,
      sessionContext: isRecord(data.sessionContext)
        ? { ...state.sessionContext, ...(data.sessionContext as WorkflowSessionContext) }
        : { ...state.sessionContext, ...(data as WorkflowSessionContext) },
      nodeResults: {
        ...state.nodeResults,
        intent: {
          ...state.nodeResults.intent,
          tags: Array.isArray(data.tags) ? (data.tags as string[]) : state.nodeResults.intent?.tags,
        },
        'brand-kb': {
          ...state.nodeResults['brand-kb'],
          knowledgeContext:
            typeof data.knowledgeContext === 'string'
              ? data.knowledgeContext
              : state.nodeResults['brand-kb']?.knowledgeContext,
          brandAssets: Array.isArray(data.brandAssets)
            ? (data.brandAssets as BrandAsset[])
            : state.nodeResults['brand-kb']?.brandAssets,
        },
        prompt: {
          ...state.nodeResults.prompt,
          positivePrompt:
            typeof data.positivePrompt === 'string'
              ? data.positivePrompt
              : state.nodeResults.prompt?.positivePrompt,
          negativePrompt:
            typeof data.negativePrompt === 'string'
              ? data.negativePrompt
              : state.nodeResults.prompt?.negativePrompt,
        },
        'image-gen': {
          ...state.nodeResults['image-gen'],
          baseImageUrl:
            typeof data.baseImageUrl === 'string'
              ? data.baseImageUrl
              : state.nodeResults['image-gen']?.baseImageUrl,
        },
        compose: {
          ...state.nodeResults.compose,
          finalImageUrl:
            typeof data.finalImageUrl === 'string'
              ? data.finalImageUrl
              : state.nodeResults.compose?.finalImageUrl,
          layers: Array.isArray(data.layers)
            ? (data.layers as ComposeLayer[])
            : state.nodeResults.compose?.layers,
        },
        eval: isRecord(data.evaluationReport)
          ? (data.evaluationReport as unknown as EvaluationReport)
          : state.nodeResults.eval,
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
