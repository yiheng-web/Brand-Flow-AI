import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WorkDetailPage from './detail'

const api = vi.hoisted(() => ({ getWork: vi.fn(), exportWork: vi.fn() }))
vi.mock('@/api/works', () => api)
vi.mock('@/components/QualityReport', () => ({
  default: ({ report }: { report: { totalScore: number } }) => <p>质检分数 {report.totalScore}</p>,
}))
const versions = [3, 2, 1].map((versionNo) => ({
  _id: `version-${versionNo}`,
  versionNo,
  imageUrl: `version-${versionNo}.png`,
  qualityReport: { totalScore: 80 + versionNo },
  promptPlan: { imagePrompt: `本版提示 ${versionNo}` },
  feedback: versionNo > 1 ? { instruction: `优化说明 ${versionNo}` } : undefined,
  createdAt: '2026-10-04T00:00:00Z',
}))
beforeEach(() => {
  vi.clearAllMocks()
  api.getWork.mockReset()
  api.exportWork.mockReset()
  api.getWork.mockResolvedValue({ _id: 'work-a', title: '咖啡', versions })
  api.exportWork.mockResolvedValue({ fileName: '咖啡-V1.png', downloadUrl: 'download.png' })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/works/work-a']}>
      <Routes>
        <Route path="/works/:id" element={<WorkDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
it('切换版本同步更新成片、质检和 Prompt，并向指定版本接口导出', async () => {
  renderPage()
  await screen.findByAltText('咖啡 V3')
  fireEvent.click(screen.getByRole('button', { name: 'V1' }))
  expect(screen.getByAltText('咖啡 V1').getAttribute('src')).toBe('version-1.png')
  expect(screen.getByText('质检分数 81')).toBeTruthy()
  fireEvent.click(screen.getByText('本版 Prompt 与优化说明'))
  expect(await screen.findByText('本版提示 1')).toBeTruthy()
  expect(screen.getByText('初始创作')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
  await waitFor(() => expect(api.exportWork).toHaveBeenCalledWith('work-a', 'version-1'))
})
it('导出失败显示错误并释放按钮，允许重试', async () => {
  api.exportWork.mockRejectedValueOnce(new Error('网络失败'))
  renderPage()
  await screen.findByAltText('咖啡 V3')
  fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
  await screen.findByText('版本导出失败，请重试')
  fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
  await waitFor(() => expect(api.exportWork).toHaveBeenCalledTimes(2))
})
