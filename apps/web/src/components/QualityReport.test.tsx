import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { FinalEvaluationResult } from '@brand-flow/contracts'
import QualityReport from './QualityReport'

afterEach(cleanup)
it('未通过时明确不可交付，展示扣分建议并可继续优化', () => {
  const report: FinalEvaluationResult = {
    totalScore: 60,
    passed: false,
    scores: {
      brandConsistency: 55,
      requirementAlignment: 70,
      composition: 65,
      visualQuality: 60,
      textReadability: 50,
    },
    deductions: [{ dimension: 'text', points: 20, reason: '文字对比度不足' }],
    strengths: [],
    suggestions: ['增加文字底板'],
  }
  const optimize = vi.fn()
  render(<QualityReport report={report} onOptimize={optimize} />)
  expect(screen.getByText('质检未通过，当前结果不可交付')).toBeTruthy()
  expect(screen.getByText(/文字对比度不足/)).toBeTruthy()
  expect(screen.getByText('增加文字底板')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '继续优化' }))
  expect(optimize).toHaveBeenCalledOnce()
})
