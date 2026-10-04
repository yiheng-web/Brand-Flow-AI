import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CandidateDownloadButton from './CandidateDownloadButton'
const api = vi.hoisted(() => ({ getCandidateDownload: vi.fn(), getResultDownload: vi.fn() }))
vi.mock('@/api/workflow', () => api)
describe('当前候选下载', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })
  it('下载当前预览候选，无需选择最终结果', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    api.getCandidateDownload.mockResolvedValue({
      fileName: 'candidate.png',
      downloadUrl: 'https://test.invalid/candidate.png',
    })
    render(<CandidateDownloadButton workflowId="workflow-a" candidateId="preview-b" />)
    fireEvent.click(screen.getByRole('button', { name: '下载当前候选' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(api.getCandidateDownload).toHaveBeenCalledWith('workflow-a', 'preview-b')
    expect(api.getResultDownload).not.toHaveBeenCalled()
  })
  it('失败后恢复按钮并允许重试', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    api.getCandidateDownload.mockRejectedValueOnce(new Error('过期')).mockResolvedValueOnce({
      fileName: 'candidate.png',
      downloadUrl: 'https://test.invalid/candidate.png',
    })
    render(<CandidateDownloadButton workflowId="workflow-a" candidateId="preview-b" />)
    fireEvent.click(screen.getByRole('button', { name: '下载当前候选' }))
    await screen.findByText('下载失败，请重试')
    fireEvent.click(screen.getByRole('button', { name: '下载当前候选' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('下载失败，请重试')).toBeNull()
  })
})
