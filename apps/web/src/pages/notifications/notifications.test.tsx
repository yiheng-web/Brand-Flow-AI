import { mockComputedStyle } from '../../../test/computed-style'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotificationsPage from './index'

const api = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
}))
vi.mock('@/api/org', () => api)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('通知中心', () => {
  it('加载失败可重试，标记已读阻止重复写并更新未读数', async () => {
    mockComputedStyle()
    api.getNotifications
      .mockRejectedValueOnce(new Error('通知暂不可用'))
      .mockResolvedValueOnce([
        {
          _id: 'notification',
          action: 'task.assign',
          resourceId: 'task',
          teamId: 'team',
          createdAt: '2026-10-11',
        },
      ])
      .mockResolvedValue([
        {
          _id: 'notification',
          action: 'task.assign',
          resourceId: 'task',
          teamId: 'team',
          createdAt: '2026-10-11',
          readAt: '2026-10-11',
        },
      ])
    api.getUnreadNotificationCount
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 })
    api.markNotificationRead.mockResolvedValue({ success: true })
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )
    await screen.findByText('通知暂不可用')
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    const read = await screen.findByRole('button', { name: '标记已读' })
    expect(screen.getByRole('link', { name: '查看任务' }).getAttribute('href')).toBe(
      '/team-tasks/task?teamId=team',
    )
    fireEvent.click(read)
    fireEvent.click(read)
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledTimes(1))
    await screen.findByText('通知中心 · 0 条未读')
    expect(screen.queryByRole('button', { name: '标记已读' })).toBeNull()
  })
})
