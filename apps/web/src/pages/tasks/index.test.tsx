import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TasksPage from './index'

const api = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  cancelWorkflow: vi.fn(),
  retryWorkflow: vi.fn(),
}))
vi.mock('@/api/workflow', () => api)
const response = {
  items: [
    {
      id: 'wf-a',
      prompt: '咖啡海报',
      status: 'failed',
      progress: 43,
      currentNode: 'generate',
      updatedAt: '2026-10-04T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/tasks']}>
      <Routes>
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/workspace" element={<p>已进入工作台</p>} />
      </Routes>
    </MemoryRouter>,
  )
describe('创作任务历史', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(api).forEach((mock) => mock.mockReset())
    api.listWorkflows.mockResolvedValue(response)
  })
  afterEach(() => cleanup())
  it('从服务端加载历史并进入工作台，而非依赖本地完整状态', async () => {
    renderPage()
    expect(await screen.findByText('咖啡海报')).toBeTruthy()
    expect(api.listWorkflows).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'personal', page: 1 }),
    )
    fireEvent.click(screen.getByText('继续创作'))
    expect(await screen.findByText('已进入工作台')).toBeTruthy()
  })
  it('失败任务可重试和取消；操作后重新读取服务端', async () => {
    api.retryWorkflow.mockResolvedValue({})
    api.cancelWorkflow.mockResolvedValue({})
    renderPage()
    await screen.findByText('咖啡海报')
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    await waitFor(() => expect(api.retryWorkflow).toHaveBeenCalledWith('wf-a'))
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(2))
    fireEvent.click(await screen.findByText('取消任务'))
    await waitFor(() => expect(api.cancelWorkflow).toHaveBeenCalledWith('wf-a'))
  })
  it('取消任务只提供查看，读取失败允许重试', async () => {
    api.listWorkflows.mockRejectedValueOnce(new Error('网络失败')).mockResolvedValueOnce({
      ...response,
      items: [{ ...response.items[0], status: 'cancelled' }],
    })
    renderPage()
    await screen.findByText('网络失败')
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByText('已取消')).toBeTruthy()
    expect(screen.queryByText('取消任务')).toBeNull()
    expect(screen.queryByText('继续创作')).toBeNull()
  })
})
