import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BriefReviewPanel from './BriefReviewPanel'

const { confirmBrief, regenerateBrief, updateBrief } = vi.hoisted(() => ({
  confirmBrief: vi.fn(),
  regenerateBrief: vi.fn(),
  updateBrief: vi.fn(),
}))

vi.mock('@/api/workflow', () => ({ confirmBrief, regenerateBrief, updateBrief }))

const brief = {
  originalRequest: '生成咖啡海报',
  normalizedIntent: '面向年轻人的科技咖啡海报',
  targetAudience: '年轻上班族',
  channel: '小红书',
  outputMode: 'graphic_design' as const,
  needsComposition: true,
  constraints: ['保持咖啡主体'],
  assumptions: [],
}

describe('BriefReviewPanel', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('确认前显示三个门禁操作并调用确认接口', async () => {
    confirmBrief.mockResolvedValue({})
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(
      <BriefReviewPanel
        workflowId="wf-1"
        brief={brief}
        awaitingConfirmation
        onChanged={onChanged}
        onRerun={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    await userEvent.click(screen.getByText('确认 Brief'))
    expect(confirmBrief).toHaveBeenCalledWith('wf-1')
    expect(onChanged).toHaveBeenCalled()
    expect(screen.getByText('修改并确认')).toBeTruthy()
    expect(screen.getByText('重新生成')).toBeTruthy()
    expect(screen.getByText('从此节点重跑')).toBeTruthy()
  })

  it('断网失败显示可重试状态，保留草稿并恢复提交按钮', async () => {
    confirmBrief.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({})
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(
      <BriefReviewPanel
        workflowId="wf-1"
        brief={brief}
        awaitingConfirmation
        onChanged={onChanged}
        onRerun={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByText('确认 Brief'))
    expect(await screen.findByText('Network Error，请恢复连接后重试')).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByLabelText('图片目标')).toHaveProperty('value', brief.normalizedIntent)
    const button = screen.getByText('确认 Brief').closest('button')
    if (!button) throw new Error('确认按钮不存在')
    await waitFor(() => expect(button.classList.contains('ant-btn-loading')).toBe(false))
    await userEvent.click(button)
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Network Error，请恢复连接后重试')).toBeNull()
  })

  it('非等待态不允许再次提交 Brief', () => {
    render(
      <BriefReviewPanel
        workflowId="wf-1"
        brief={brief}
        awaitingConfirmation={false}
        onChanged={vi.fn()}
        onRerun={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    expect(screen.queryByText('确认 Brief')).toBeNull()
  })
})
