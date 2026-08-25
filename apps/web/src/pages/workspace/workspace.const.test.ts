import { describe, expect, it } from 'vitest'

import { getVisibleFlowNodes } from './workspace.const'

describe('getVisibleFlowNodes', () => {
  it('关闭排版合成时只隐藏 compose 并保留最终质检', () => {
    const nodeIds = getVisibleFlowNodes(false).map((node) => node.id)

    expect(nodeIds).not.toContain('compose')
    expect(nodeIds.at(-1)).toBe('finalEvaluation')
    expect(nodeIds).toHaveLength(6)
  })

  it('开启排版合成时展示完整七节点', () => {
    expect(getVisibleFlowNodes(true).map((node) => node.id)).toContain('compose')
    expect(getVisibleFlowNodes(true)).toHaveLength(7)
  })
})
