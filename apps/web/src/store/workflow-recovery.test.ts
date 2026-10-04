import { afterEach, describe, expect, it } from 'vitest'
import { useWorkflowStore } from './useWorkflowStore'

describe('工作流历史切换', () => {
  afterEach(() => useWorkflowStore.getState().reset())
  it('切换任务指针时清除上一任务结果，避免恢复期间误保存到新任务', () => {
    useWorkflowStore.setState({
      workflowId: 'old',
      status: 'completed',
      prompt: '旧任务',
      result: { finalImageUrl: 'old-image' },
      imageUrl: 'old-image',
      error: '旧错误',
      nodeStreamData: { brief: { old: true } },
    })
    useWorkflowStore.getState().setWorkflowId('new')
    expect(useWorkflowStore.getState()).toMatchObject({
      workflowId: 'new',
      status: 'idle',
      prompt: '',
      result: null,
      imageUrl: null,
      error: null,
      nodeStreamData: {},
    })
  })
})
