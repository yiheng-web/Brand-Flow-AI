import type { WorkflowResult } from '@brand-flow/contracts'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { FlowNodeId, NodeExecStatus } from '../pages/workspace/workspace.const'

type WorkflowStatus = 'idle' | 'pending' | 'running' | 'awaiting_user' | 'completed' | 'failed'
type Updater<T> = T | ((previous: T) => T)

export const INITIAL_NODE_EXEC_STATUSES: Record<FlowNodeId, NodeExecStatus> = {
  brief: 'pending',
  brandConstraint: 'pending',
  creativeDirection: 'pending',
  prompt: 'pending',
  generate: 'pending',
  compose: 'pending',
  finalEvaluation: 'pending',
}

interface WorkflowState {
  workflowId: string | null
  status: WorkflowStatus
  prompt: string
  imageUrl: string | null
  error: string | null
  result: WorkflowResult | null
  nodeExecStatuses: Record<FlowNodeId, NodeExecStatus>
  nodeStreamData: Record<string, Record<string, unknown>>
  setWorkflowId: (id: string) => void
  setStatus: (status: WorkflowStatus) => void
  setPrompt: (prompt: string) => void
  setImageUrl: (url: string | null) => void
  setResult: (result: WorkflowResult | null) => void
  setError: (error: string | null) => void
  setNodeExecStatuses: (statuses: Updater<Record<FlowNodeId, NodeExecStatus>>) => void
  setNodeStreamData: (data: Updater<Record<string, Record<string, unknown>>>) => void
  reset: () => void
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      workflowId: null,
      status: 'idle',
      prompt: '',
      imageUrl: null,
      error: null,
      result: null,
      nodeExecStatuses: INITIAL_NODE_EXEC_STATUSES,
      nodeStreamData: {},
      setWorkflowId: (workflowId) => set({ workflowId }),
      setStatus: (status) => set({ status }),
      setPrompt: (prompt) => set({ prompt }),
      setImageUrl: (imageUrl) => set({ imageUrl }),
      setResult: (result) => set({ result, imageUrl: result?.finalImageUrl ?? null }),
      setError: (error) => set({ error }),
      setNodeExecStatuses: (statuses) =>
        set((state) => ({
          nodeExecStatuses:
            typeof statuses === 'function' ? statuses(state.nodeExecStatuses) : statuses,
        })),
      setNodeStreamData: (data) =>
        set((state) => ({
          nodeStreamData: typeof data === 'function' ? data(state.nodeStreamData) : data,
        })),
      reset: () =>
        set({
          workflowId: null,
          status: 'idle',
          prompt: '',
          imageUrl: null,
          error: null,
          result: null,
          nodeExecStatuses: INITIAL_NODE_EXEC_STATUSES,
          nodeStreamData: {},
        }),
    }),
    { name: 'brand-flow-workflow' },
  ),
)
