import { StateGraph, END, START, Annotation } from '@langchain/langgraph'

import { createIntentChain, IntentOutput } from './chains/intent-chain'
import { createPromptChain, PromptChainOutput } from './chains/prompt-chain'
import { createPromptEvaluationChain } from './evaluate/prompt-evaluate.chain'
import type { EvaluationResult } from './evaluate/evaluate-types'
import type { GenerateResult } from '../generate/generate-types'
import { generateService } from '../generate'
import { brandService } from '../brand'
import { conversationMemory } from './memory/conversation-memory'
import { logger } from '../common/logger'

// ============================================================
// 1. Workflow node contracts
// ============================================================

export const WORKFLOW_NODE_IDS = [
  'intent',
  'brand-kb',
  'prompt',
  'image-gen',
  'compose',
  'eval',
] as const

export type WorkflowNodeId = (typeof WORKFLOW_NODE_IDS)[number]

export type NodeStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'

export interface BrandAsset {
  id: string
  type: 'color' | 'logo' | 'font' | 'image'
  label: string
  value: string
  selected: boolean
}

export interface ImageParams {
  model: string
  seed?: number
  steps?: number
  size: string
}

export interface ComposeLayer {
  id: string
  type: 'image' | 'text' | 'logo'
  label: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  content?: string
  url?: string
}

export interface EvaluationReport {
  score: number
  passed: boolean
  feedback: string[]
  targetRetryNode?: WorkflowNodeId
  thinking: string[]
}

export type NodeStateMap = Record<WorkflowNodeId, NodeStatus>

export interface AgentStateType {
  userQuery: string
  context: Record<string, unknown> | undefined
  intentResult: IntentOutput | undefined
  tags: string[] | undefined
  knowledgeContext: string | undefined
  brandAssets: BrandAsset[] | undefined
  promptResult: PromptChainOutput | undefined
  positivePrompt: string | undefined
  negativePrompt: string | undefined
  generateResult: GenerateResult | undefined
  baseImageUrl: string | undefined
  imageParams: ImageParams | undefined
  finalImageUrl: string | undefined
  layers: ComposeLayer[] | undefined
  evaluationResult: EvaluationResult | undefined
  evaluationReport: EvaluationReport | undefined
  targetRetryNode: WorkflowNodeId | undefined
  activeNodeId: WorkflowNodeId | undefined
  nodeStates: NodeStateMap | undefined
  retryCount: number
  status: 'running' | 'success' | 'failed'
  error: string | undefined
}

const DEFAULT_NODE_STATES: NodeStateMap = {
  intent: 'PENDING',
  'brand-kb': 'PENDING',
  prompt: 'PENDING',
  'image-gen': 'PENDING',
  compose: 'PENDING',
  eval: 'PENDING',
}

function markNode(
  state: Partial<AgentStateType>,
  nodeId: WorkflowNodeId,
  status: NodeStatus,
): NodeStateMap {
  return {
    ...DEFAULT_NODE_STATES,
    ...(state.nodeStates ?? {}),
    [nodeId]: status,
  }
}

function shouldRunNode(state: Partial<AgentStateType>, nodeId: WorkflowNodeId): boolean {
  const rerunFromNodeId = state.context?.rerunFromNodeId as WorkflowNodeId | undefined
  if (!rerunFromNodeId) return true

  return WORKFLOW_NODE_IDS.indexOf(nodeId) >= WORKFLOW_NODE_IDS.indexOf(rerunFromNodeId)
}

function extractTags(userQuery: string, intentResult: IntentOutput): string[] {
  const raw = [
    intentResult.intent,
    ...userQuery
      .replace(/[，。！？,.!?]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  ]

  return Array.from(new Set(raw)).slice(0, 8)
}

function buildBrandAssets(): BrandAsset[] {
  const brand = brandService.getBrandGuidelines()
  const colorAssets = brand.mainColors.map((color, index) => ({
    id: `brand-color-${index + 1}`,
    type: 'color' as const,
    label: `品牌色 ${color}`,
    value: color,
    selected: true,
  }))

  return [
    ...colorAssets,
    {
      id: 'brand-logo-primary',
      type: 'logo',
      label: `${brand.brandName} Logo`,
      value: 'brand-logo-primary.svg',
      selected: true,
    },
  ]
}

export const AgentState = Annotation.Root({
  userQuery: Annotation<string>({
    reducer: (prev: string, next: string) => next ?? prev,
  }),
  context: Annotation<Record<string, unknown> | undefined>({
    reducer: (
      prev: Record<string, unknown> | undefined,
      next: Record<string, unknown> | undefined,
    ) => next ?? prev,
    default: () => ({}),
  }),
  intentResult: Annotation<IntentOutput | undefined>({
    reducer: (prev: IntentOutput | undefined, next: IntentOutput | undefined) => next ?? prev,
  }),
  tags: Annotation<string[] | undefined>({
    reducer: (prev: string[] | undefined, next: string[] | undefined) => next ?? prev,
  }),
  knowledgeContext: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
  brandAssets: Annotation<BrandAsset[] | undefined>({
    reducer: (prev: BrandAsset[] | undefined, next: BrandAsset[] | undefined) => next ?? prev,
  }),
  promptResult: Annotation<PromptChainOutput | undefined>({
    reducer: (prev: PromptChainOutput | undefined, next: PromptChainOutput | undefined) =>
      next ?? prev,
  }),
  positivePrompt: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
  negativePrompt: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
  generateResult: Annotation<GenerateResult | undefined>({
    reducer: (prev: GenerateResult | undefined, next: GenerateResult | undefined) => next ?? prev,
  }),
  baseImageUrl: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
  imageParams: Annotation<ImageParams | undefined>({
    reducer: (prev: ImageParams | undefined, next: ImageParams | undefined) => next ?? prev,
  }),
  finalImageUrl: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
  layers: Annotation<ComposeLayer[] | undefined>({
    reducer: (prev: ComposeLayer[] | undefined, next: ComposeLayer[] | undefined) => next ?? prev,
  }),
  evaluationResult: Annotation<EvaluationResult | undefined>({
    reducer: (prev: EvaluationResult | undefined, next: EvaluationResult | undefined) =>
      next ?? prev,
  }),
  evaluationReport: Annotation<EvaluationReport | undefined>({
    reducer: (prev: EvaluationReport | undefined, next: EvaluationReport | undefined) =>
      next ?? prev,
  }),
  targetRetryNode: Annotation<WorkflowNodeId | undefined>({
    reducer: (prev: WorkflowNodeId | undefined, next: WorkflowNodeId | undefined) => next ?? prev,
  }),
  activeNodeId: Annotation<WorkflowNodeId | undefined>({
    reducer: (prev: WorkflowNodeId | undefined, next: WorkflowNodeId | undefined) => next ?? prev,
  }),
  nodeStates: Annotation<NodeStateMap | undefined>({
    reducer: (prev: NodeStateMap | undefined, next: NodeStateMap | undefined) => next ?? prev,
    default: () => ({ ...DEFAULT_NODE_STATES }),
  }),
  retryCount: Annotation<number>({
    reducer: (prev: number, next: number) => (prev ?? 0) + (next ?? 0),
    default: () => 0,
  }),
  status: Annotation<'running' | 'success' | 'failed'>({
    reducer: (prev: 'running' | 'success' | 'failed', next: 'running' | 'success' | 'failed') =>
      next ?? prev,
    default: () => 'running' as const,
  }),
  error: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
  // LangGraph exposes internal conditional types that are not portable in declaration output.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

// ============================================================
// 2. Node functions
// ============================================================

export async function intentNode(state: Partial<AgentStateType>): Promise<Partial<AgentStateType>> {
  if (state.status === 'failed') {
    logger.warn(`[intentNode] 状态已失败，跳过`)
    return state
  }
  if (!shouldRunNode(state, 'intent')) return state

  try {
    const intentChain = createIntentChain()
    const result = await intentChain.invoke({
      userQuery: state.userQuery ?? '',
      context: state.context,
    })
    return {
      activeNodeId: 'intent',
      intentResult: result,
      tags: extractTags(state.userQuery ?? '', result),
      nodeStates: markNode(state, 'intent', 'SUCCESS'),
      status: 'running',
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    logger.error(`意图识别失败: ${message}`)
    return {
      activeNodeId: 'intent',
      nodeStates: markNode(state, 'intent', 'FAILED'),
      status: 'failed',
      error: `意图识别失败: ${message}`,
    }
  }
}

export async function knowledgeNode(
  state: Partial<AgentStateType>,
): Promise<Partial<AgentStateType>> {
  if (state.status === 'failed') {
    logger.warn(`[knowledgeNode] 状态已失败，跳过`)
    return state
  }
  if (!shouldRunNode(state, 'brand-kb')) return state

  try {
    const brandContext = brandService.formatBrandContext()
    const sessionId = state.context?.sessionId as string | undefined
    const history = sessionId ? conversationMemory.getFormattedHistory(sessionId) : ''

    const knowledgeContext = [
      brandContext.formattedBrandText,
      history ? `对话历史：\n${history}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    return {
      activeNodeId: 'brand-kb',
      knowledgeContext,
      brandAssets: buildBrandAssets(),
      nodeStates: markNode(state, 'brand-kb', 'SUCCESS'),
      status: 'running',
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    logger.error(`知识获取失败: ${message}`)
    return {
      activeNodeId: 'brand-kb',
      nodeStates: markNode(state, 'brand-kb', 'FAILED'),
      status: 'failed',
      error: `知识获取失败: ${message}`,
    }
  }
}

export async function promptNode(state: Partial<AgentStateType>): Promise<Partial<AgentStateType>> {
  if (state.status === 'failed') {
    logger.warn(`[promptNode] 状态已失败，跳过`)
    return state
  }
  if (!shouldRunNode(state, 'prompt')) return state

  try {
    const promptChain = createPromptChain()
    const result = await promptChain.invoke({
      userQuery: state.userQuery ?? '',
      intent: state.intentResult?.intent ?? '其他',
      brandGuidelines:
        state.knowledgeContext ?? brandService.formatBrandContext().formattedBrandText,
      context: state.knowledgeContext,
    })
    return {
      activeNodeId: 'prompt',
      promptResult: result,
      positivePrompt: result.finalPrompt,
      negativePrompt: 'low quality, blurry, malformed text, watermark, off-brand colors',
      nodeStates: markNode(state, 'prompt', 'SUCCESS'),
      status: 'running',
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    logger.error(`提示词生成失败: ${message}`)
    return {
      activeNodeId: 'prompt',
      nodeStates: markNode(state, 'prompt', 'FAILED'),
      status: 'failed',
      error: `提示词生成失败: ${message}`,
    }
  }
}

export async function generateNode(
  state: Partial<AgentStateType>,
): Promise<Partial<AgentStateType>> {
  if (state.status === 'failed') {
    logger.warn(`[generateNode] 状态已失败，跳过`)
    return state
  }
  if (!shouldRunNode(state, 'image-gen')) return state

  try {
    const intent = state.intentResult?.intent
    const generateType =
      intent === '图片生成' ? 'image' : intent === '品牌描述' ? 'text' : 'brand_material'

    if (!state.promptResult) {
      return {
        status: 'failed',
        error: '缺少 promptResult，无法生成',
      }
    }

    const imageParams: ImageParams = {
      model:
        (state.context?.imageModel as string | undefined) ?? process.env.IMAGE_MODEL ?? 'dall-e-3',
      size:
        (state.context?.imageSize as string | undefined) ?? process.env.IMAGE_SIZE ?? '1024x1024',
      seed: Date.now() % 100000,
      steps: 30,
    }

    const result = await generateService.executeGenerate({
      promptData: state.promptResult,
      generateType,
      sessionId: state.context?.sessionId as string | undefined,
    })

    if (state.context?.sessionId) {
      conversationMemory.addMessage({
        sessionId: state.context.sessionId as string,
        message: {
          role: 'assistant',
          content: result.content.slice(0, 500),
          timestamp: Date.now(),
        },
      })
    }

    return {
      activeNodeId: 'image-gen',
      generateResult: result,
      baseImageUrl: result.content,
      imageParams,
      nodeStates: markNode(state, 'image-gen', result.success ? 'SUCCESS' : 'FAILED'),
      status: result.success ? 'running' : 'failed',
      error: result.success ? undefined : (result.message ?? '生成返回失败'),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    logger.error(`内容生成失败: ${message}`)
    return {
      activeNodeId: 'image-gen',
      nodeStates: markNode(state, 'image-gen', 'FAILED'),
      status: 'failed',
      error: `内容生成失败: ${message}`,
    }
  }
}

export async function composeNode(
  state: Partial<AgentStateType>,
): Promise<Partial<AgentStateType>> {
  if (state.status === 'failed') {
    logger.warn(`[composeNode] 状态已失败，跳过`)
    return state
  }
  if (!shouldRunNode(state, 'compose')) return state

  const baseImageUrl = state.baseImageUrl || state.generateResult?.content || ''
  const selectedLogo = state.brandAssets?.find((asset) => asset.type === 'logo' && asset.selected)
  const finalImageUrl = baseImageUrl
  const layers: ComposeLayer[] = [
    {
      id: 'base-image',
      type: 'image',
      label: '底图',
      x: 0,
      y: 0,
      width: 1024,
      height: 1024,
      opacity: 1,
      url: baseImageUrl,
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
      content: (state.context?.headline as string | undefined) ?? 'SUMMER ICE',
    },
    {
      id: 'brand-logo',
      type: 'logo',
      label: selectedLogo?.label ?? '品牌 Logo',
      x: 856,
      y: 884,
      width: 96,
      height: 96,
      opacity: 1,
      url: selectedLogo?.value ?? 'brand-logo-primary.svg',
    },
  ]

  return {
    activeNodeId: 'compose',
    finalImageUrl,
    layers,
    nodeStates: markNode(state, 'compose', 'SUCCESS'),
    status: 'running',
  }
}

export async function evaluateNode(
  state: Partial<AgentStateType>,
): Promise<Partial<AgentStateType>> {
  if (state.status === 'failed') {
    logger.warn(`[evaluateNode] 状态已失败，跳过`)
    return state
  }
  if (!shouldRunNode(state, 'eval')) return state

  try {
    const evalChain = createPromptEvaluationChain()
    const result = await evalChain.invoke({
      userQuery: state.userQuery ?? '',
      intentResult: state.intentResult!,
      promptResult: state.promptResult!,
      brandGuidelines: state.knowledgeContext,
    })

    const score = Math.max(1, Math.min(10, result.overallScore))
    const passed = score >= 6
    const targetRetryNode: WorkflowNodeId | undefined = passed ? undefined : 'prompt'
    const feedback = [
      result.intentEvaluation.comment,
      result.promptEvaluation.comment,
      result.complianceEvaluation.comment,
      ...result.suggestions,
    ].filter(Boolean)
    const evaluationReport: EvaluationReport = {
      score,
      passed,
      feedback,
      targetRetryNode,
      thinking: [
        '正在对比原始需求、品牌规范与最终成片。',
        `综合评分为 ${score}/10。`,
        passed ? '结果达标，可以进入画板精修。' : '结果未达标，建议回溯到 Prompt 专家节点重构。',
      ],
    }

    return {
      activeNodeId: 'eval',
      evaluationResult: result,
      evaluationReport,
      targetRetryNode,
      retryCount: (state.retryCount ?? 0) + 1,
      nodeStates: markNode(state, 'eval', 'SUCCESS'),
      status: 'success',
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    logger.error(`评估失败: ${message}`)
    return {
      activeNodeId: 'eval',
      evaluationResult: {
        overallScore: 1,
        intentEvaluation: { score: 1, comment: '评估异常' },
        promptEvaluation: { score: 1, comment: '评估异常' },
        complianceEvaluation: { score: 1, comment: '评估异常' },
        suggestions: ['评估系统异常，请检查'],
        status: 'failed',
      },
      evaluationReport: {
        score: 1,
        passed: false,
        feedback: ['评估系统异常，请检查'],
        targetRetryNode: 'prompt',
        thinking: ['质检链路执行异常，建议重新运行 Prompt 专家节点。'],
      },
      targetRetryNode: 'prompt',
      retryCount: (state.retryCount ?? 0) + 1,
      nodeStates: markNode(state, 'eval', 'FAILED'),
      status: 'failed',
    }
  }
}

// ============================================================
// 3. 条件路由
// ============================================================
export function routeAfterEvaluation(): typeof END {
  return END
}

// ============================================================
// 4. 构建 LangGraph
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAgentGraph(): any {
  const workflow = new StateGraph(AgentState)
    .addNode('intentNode', intentNode)
    .addNode('knowledgeNode', knowledgeNode)
    .addNode('promptNode', promptNode)
    .addNode('generateNode', generateNode)
    .addNode('composeNode', composeNode)
    .addNode('evaluateNode', evaluateNode)
    .addEdge(START, 'intentNode')
    .addEdge('intentNode', 'knowledgeNode')
    .addEdge('knowledgeNode', 'promptNode')
    .addEdge('promptNode', 'generateNode')
    .addEdge('generateNode', 'composeNode')
    .addEdge('composeNode', 'evaluateNode')
    .addConditionalEdges('evaluateNode', routeAfterEvaluation, {
      [END]: END,
    })

  return workflow.compile()
}

// ============================================================
// 5. 便捷调用
// ============================================================
export async function runAgent(params: {
  userQuery: string
  context?: Record<string, unknown>
}): Promise<AgentStateType> {
  const graph = createAgentGraph()
  const initialState: Partial<AgentStateType> = {
    userQuery: params.userQuery,
    context: params.context ?? {},
    retryCount: 0,
    status: 'running',
  }

  const finalState = await graph.invoke(initialState)
  return finalState as AgentStateType
}
