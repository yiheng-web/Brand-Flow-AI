import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WorkflowResult } from '@brand-flow/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CreativeDirectionPanel from './CreativeDirectionPanel'

const creativeDirection = {
  selectedDirectionId: '',
  directions: [
    {
      id: 'direction-1',
      name: '方向一',
      title: '方向一',
      concept: '概念一',
      summary: '概念一',
      reason: '符合品牌',
      risk: '对比度风险',
      visualKeywords: ['极简'],
      visualStyle: '极简',
    },
    {
      id: 'direction-2',
      name: '方向二',
      title: '方向二',
      concept: '概念二',
      summary: '概念二',
      reason: '识别度高',
      risk: '元素较多',
      visualKeywords: ['科技'],
      visualStyle: '科技',
    },
  ],
} as NonNullable<WorkflowResult['creativeDirection']>

describe('CreativeDirectionPanel', () => {
  afterEach(() => cleanup())

  it('选择方向时不推进，点击底部确定后才提交', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <CreativeDirectionPanel
        creativeDirection={creativeDirection}
        awaitingConfirmation
        onConfirm={onConfirm}
      />,
    )

    await userEvent.click(screen.getByLabelText('方向二'))
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '确定创意方案' }))
    expect(onConfirm).toHaveBeenCalledWith(creativeDirection.directions[1])
  })
})
