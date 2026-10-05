import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role, spacePermissions } from '@brand-flow/contracts'
import { useUserStore } from '@/store/useUserStore'
import { mockComputedStyle } from '../../../test/computed-style'
import WorksPage from './index'
import type { WorkData } from '@/api/works'

const api = vi.hoisted(() => ({ getWorks: vi.fn(), deleteWork: vi.fn() }))
vi.mock('@/api/works', () => api)
const shared: WorkData = {
  _id: 'shared',
  title: '成员作品',
  spaceId: 'team',
  finalImageUrl: '',
  creatorId: { _id: 'member', email: 'member@test.invalid' },
  canEdit: false,
}

describe('作品空间共享与切换', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockComputedStyle()
    useUserStore.setState({
      currentSpaceId: 'team',
      currentSpaceName: '测试团队',
      currentSpaceType: 'team',
      spaces: [
        {
          id: 'team',
          name: '测试团队',
          type: 'team',
          description: '',
          permissions: spacePermissions('team', Role.MEMBER),
        },
        {
          id: 'personal',
          name: '个人空间',
          type: 'personal',
          description: '',
          permissions: spacePermissions('personal', Role.OWNER),
        },
      ],
    })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('成员可浏览他人团队作品并显示创建者，但不能删除', async () => {
    api.getWorks.mockResolvedValue([shared])
    render(
      <MemoryRouter>
        <WorksPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: '成员作品' })
    expect(screen.getByText('创建者：member@test.invalid')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: '删除成员作品' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('切换个人空间后，迟到的团队请求不能覆盖个人作品', async () => {
    let resolveTeam!: (data: WorkData[]) => void
    api.getWorks.mockImplementation((spaceId: string) =>
      spaceId === 'team'
        ? new Promise<WorkData[]>((resolve) => {
            resolveTeam = resolve
          })
        : Promise.resolve([
            { ...shared, _id: 'own', title: '个人作品', spaceId: 'personal', canEdit: true },
          ]),
    )
    render(
      <MemoryRouter>
        <WorksPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(api.getWorks).toHaveBeenCalledWith('team'))
    act(() => useUserStore.getState().setCurrentSpace('personal'))
    await screen.findByRole('heading', { name: '个人作品' })
    await act(async () => resolveTeam([shared]))
    expect(screen.queryByRole('heading', { name: '成员作品' })).toBeNull()
    expect(screen.getByRole('heading', { name: '个人作品' })).toBeTruthy()
  })
})
