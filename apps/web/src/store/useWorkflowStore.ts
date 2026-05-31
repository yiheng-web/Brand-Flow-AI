import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentState } from '@/api/workflow'
import type { FlowNodeId, NodeExecStatus } from '../pages/workspace/workspace.const'

type WorkflowStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed'

interface WorkflowState {
  workflowId: string | null
  status: WorkflowStatus
  prompt: string
  imageUrl: string | null
  imagePrompt: string | null
  error: string | null
  agentState: AgentState | null
  // 节点执行状态
  nodeExecStatuses: Record<FlowNodeId, NodeExecStatus>
  // 节点流数据
  nodeStreamData: Record<string, Record<string, any>>
  // 操作函数
  setWorkflowId: (id: string) => void
  setStatus: (status: WorkflowStatus) => void
  setPrompt: (prompt: string) => void
  setImageUrl: (url: string | null) => void
  setAgentState: (state: AgentState | null) => void
  setError: (error: string | null) => void
  setNodeExecStatuses: (statuses: Record<FlowNodeId, NodeExecStatus>) => void
  setNodeStreamData: (data: Record<string, Record<string, any>>) => void
  reset: () => void
}

// 初始节点执行状态
const INITIAL_NODE_EXEC_STATUSES: Record<FlowNodeId, NodeExecStatus> = {
  intent: 'pending',
  'brand-kb': 'pending',
  prompt: 'pending',
  'image-gen': 'pending',
  compose: 'pending',
  eval: 'pending',
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      workflowId: null,
      status: 'idle',
      prompt: '',
      imageUrl: null,
      imagePrompt: null,
      error: null,
      agentState: null,
      nodeExecStatuses: INITIAL_NODE_EXEC_STATUSES,
      nodeStreamData: {},

      setWorkflowId: (id) => set({ workflowId: id }),
      setStatus: (status) => set({ status }),
      setPrompt: (prompt) => set({ prompt }),
      setImageUrl: (url) => set({ imageUrl: url }),
      setAgentState: (agentState) => {
        const content = agentState?.generateResult?.content
        const imageUrl = typeof content === 'string' && content.startsWith('http') ? content : null
        const imagePrompt = agentState?.generateResult?.promptUsed ?? null
        set({ agentState, imageUrl, status: agentState?.status ?? 'running' })
      },
      setError: (error) => set({ error }),
      setNodeExecStatuses: (statuses) => set({ nodeExecStatuses: statuses }),
      setNodeStreamData: (data) => set({ nodeStreamData: data }),
      reset: () => set({
        workflowId: null,
        status: 'idle',
        prompt: '',
        imageUrl: null,
        imagePrompt: null,
        error: null,
        agentState: null,
        nodeExecStatuses: INITIAL_NODE_EXEC_STATUSES,
        nodeStreamData: {},
      }),
    }),
    { name: 'brand-flow-workflow' }
  )
)
