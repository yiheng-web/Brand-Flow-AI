import { mockComputedStyle } from '../../../test/computed-style'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserStore } from '@/store/useUserStore'
import TeamTasksPage from './index'
import TaskDetailPage from './detail'

const api = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  getTaskTimeline: vi.fn(),
  taskCommand: vi.fn(),
  getSpaceMembers: vi.fn(),
  getSubmissions: vi.fn(),
  getDeliverables: vi.fn(),
  getTaskDashboard: vi.fn(),
}))
vi.mock('@/api/tasks', () => api)
vi.mock('@/api/org', () => ({ getSpaceMembers: api.getSpaceMembers }))
const task = {
  id: 'task',
  teamId: 'team',
  title: '品牌海报',
  description: '',
  status: 'pending',
  version: 1,
  assigneeId: 'member',
  permissions: { manage: false, execute: true, review: false },
  requirementSnapshot: { prompt: '新品海报', needsComposition: false },
}
describe('团队任务', () => {
  beforeEach(() => {
    mockComputedStyle()
    Object.values(api).forEach((mock) => mock.mockReset())
    useUserStore.setState(useUserStore.getInitialState(), true)
    useUserStore.setState({
      spaces: [{ id: 'team', type: 'team', name: '设计团队', description: '' }],
      currentSpaceId: 'team',
    })
    api.listTasks.mockResolvedValue({ items: [task], total: 1, page: 1, pageSize: 20 })
    api.getTask.mockResolvedValue(task)
    api.getTaskTimeline.mockResolvedValue([])
    api.getSpaceMembers.mockResolvedValue([])
    api.getSubmissions.mockResolvedValue([])
    api.getDeliverables.mockResolvedValue([])
    api.getTaskDashboard.mockResolvedValue({
      mine: { todo: 1, inProgress: 0, rejected: 0, completed: 0 },
    })
    api.taskCommand.mockResolvedValue({ ...task, status: 'accepted' })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('看板使用团队 API，失败后可重试', async () => {
    api.listTasks.mockRejectedValueOnce(new Error('任务加载失败'))
    render(
      <MemoryRouter>
        <TeamTasksPage />
      </MemoryRouter>,
    )
    await screen.findByText('任务加载失败')
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByRole('link', { name: '品牌海报' })).toBeTruthy()
    expect(api.listTasks).toHaveBeenLastCalledWith({
      teamId: 'team',
      view: 'mine',
      page: 1,
      status: undefined,
      deadline: undefined,
    })
    expect(screen.queryByRole('button', { name: '创建任务' })).toBeNull()
  })
  it('接受使用最新任务版本，重复点击只发一次并刷新', async () => {
    render(
      <MemoryRouter initialEntries={['/team-tasks/task?teamId=team']}>
        <Routes>
          <Route path="/team-tasks/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const button = await screen.findByRole('button', { name: /接受任务/ })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(api.taskCommand).toHaveBeenCalledTimes(1))
    expect(api.taskCommand).toHaveBeenCalledWith(task, 'accept', {
      assigneeId: undefined,
      reason: '',
    })
    await waitFor(() => expect(api.getTask).toHaveBeenCalledTimes(2))
  })
  it('Viewer 不显示接受、派发或取消按钮', async () => {
    api.getTask.mockResolvedValue({
      ...task,
      permissions: { manage: false, execute: false, review: false },
    })
    render(
      <MemoryRouter initialEntries={['/team-tasks/task?teamId=team']}>
        <Routes>
          <Route path="/team-tasks/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('新品海报')
    expect(screen.queryByRole('button', { name: '接受任务' })).toBeNull()
    expect(screen.queryByRole('button', { name: '派发任务' })).toBeNull()
    expect(screen.queryByRole('button', { name: '取消任务' })).toBeNull()
  })
})
