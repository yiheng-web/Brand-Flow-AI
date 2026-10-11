import { mockComputedStyle } from '../../../test/computed-style'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskData } from '@brand-flow/contracts'
import SubmissionsPanel from './submissions'

const api = vi.hoisted(() => ({
  getSubmissions: vi.fn(),
  getDeliverables: vi.fn(),
  submitTask: vi.fn(),
  reviewTask: vi.fn(),
  resumeTask: vi.fn(),
  getWorkVersion: vi.fn(),
}))
vi.mock('@/api/tasks', () => api)
vi.mock('@/api/works', () => ({ getWorkVersion: api.getWorkVersion }))
const task: TaskData = {
  id: 'task',
  title: '海报',
  description: '',
  enterpriseId: 'enterprise',
  teamId: 'team',
  creatorId: 'owner',
  assigneeId: 'member',
  priority: 'normal',
  status: 'in_progress',
  version: 4,
  requirementSnapshot: { prompt: '海报', needsComposition: false },
  overdue: false,
  permissions: { execute: true, review: false, manage: false },
  createdAt: '',
  updatedAt: '',
}
describe('成果提交与审核页面', () => {
  beforeEach(() => {
    mockComputedStyle()
    Object.values(api).forEach((mock) => mock.mockReset())
    api.getSubmissions.mockResolvedValue([])
    api.getDeliverables.mockResolvedValue([
      { workId: 'work', workVersionId: 'v1', versionNo: 1, title: '海报' },
    ])
    api.getWorkVersion.mockResolvedValue({ imageUrl: 'data:image/png;base64,', versionNo: 1 })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('每轮历史保留意见与对应版本预览', async () => {
    api.getSubmissions.mockResolvedValue([
      {
        id: 's1',
        round: 1,
        status: 'rejected',
        workId: 'work',
        workVersionId: 'v1',
        reviewComment: '增强蓝色',
        createdAt: '2026-10-11T00:00:00Z',
      },
      {
        id: 's2',
        round: 2,
        status: 'approved',
        workId: 'work',
        workVersionId: 'v2',
        createdAt: '2026-10-11T01:00:00Z',
      },
    ])
    render(
      <MemoryRouter>
        <SubmissionsPanel task={{ ...task, status: 'completed' }} onChanged={vi.fn()} />
      </MemoryRouter>,
    )
    await screen.findByText('第 1 轮提交')
    await screen.findByText('第 2 轮提交')
    expect(screen.getByText('审核意见：增强蓝色')).toBeTruthy()
    await waitFor(() => expect(api.getWorkVersion).toHaveBeenCalledWith('work', 'v2'))
  })
  it('驳回需意见，重复审核点击只发送一次', async () => {
    const changed = vi.fn()
    render(
      <MemoryRouter>
        <SubmissionsPanel
          task={{
            ...task,
            status: 'reviewing',
            latestSubmissionId: 's1',
            permissions: { execute: false, review: true, manage: true },
          }}
          onChanged={changed}
        />
      </MemoryRouter>,
    )
    const button = await screen.findByRole('button', { name: '驳回成果' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('审核意见'), { target: { value: '增强蓝色' } })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(api.reviewTask).toHaveBeenCalledTimes(1))
    expect(api.reviewTask.mock.calls[0].slice(1)).toEqual(['s1', 'reject', '增强蓝色'])
    expect(changed).toHaveBeenCalledTimes(1)
  })
  it('返修失败可刷新重试，展示真实错误', async () => {
    api.resumeTask.mockRejectedValue(new Error('返修启动失败'))
    render(
      <MemoryRouter>
        <SubmissionsPanel task={{ ...task, status: 'rejected' }} onChanged={vi.fn()} />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: '按审核意见继续修改' }))
    await screen.findByText('返修启动失败')
    expect(screen.getByRole('button', { name: '刷新重试' })).toBeTruthy()
  })
})
