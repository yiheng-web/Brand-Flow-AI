import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Role, spacePermissions } from '@brand-flow/contracts'
import { useUserStore } from '@/store/useUserStore'
import type { KnowledgeData } from '@/api/knowledge'
import { mockComputedStyle } from '../../../test/computed-style'
import KnowledgeListPage from './index'

const api = vi.hoisted(() => ({
  getKnowledgeList: vi.fn(),
  createKnowledge: vi.fn(),
  deleteKnowledge: vi.fn(),
  updateKnowledge: vi.fn(),
}))
vi.mock('@/api/knowledge', () => api)
beforeEach(() => {
  vi.resetAllMocks()
  mockComputedStyle()
  useUserStore.setState({
    currentSpaceId: 'team-a',
    currentSpaceType: 'team',
    currentSpaceName: '甲团队',
    spaces: [
      {
        id: 'team-a',
        name: '甲团队',
        description: '',
        type: 'team',
        permissions: spacePermissions('team', Role.VIEWER),
      },
      {
        id: 'team-b',
        name: '乙团队',
        description: '',
        type: 'team',
        permissions: spacePermissions('team', Role.ADMIN),
      },
      {
        id: 'enterprise',
        name: '企业',
        description: '',
        type: 'enterprise',
        permissions: spacePermissions('enterprise', Role.VIEWER),
      },
    ],
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('显示继承来源，Viewer 只读，可按来源筛选', async () => {
  api.getKnowledgeList.mockResolvedValue([
    {
      _id: '1',
      name: '企业品牌',
      spaceId: 'enterprise',
      spaceType: 'enterprise',
      isRequired: true,
    },
    { _id: '2', name: '团队品牌', spaceId: 'team-a', spaceType: 'team', isRequired: true },
  ])
  render(
    <MemoryRouter>
      <KnowledgeListPage />
    </MemoryRouter>,
  )
  await screen.findByText('企业品牌')
  expect(screen.getByText('来自企业 · 自动必选')).toBeTruthy()
  expect((screen.getByRole('button', { name: /新建知识库$/ }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect(
    screen
      .getAllByRole('button', { name: '删除知识库' })
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true)
  await userEvent.click(screen.getByRole('combobox', { name: '规则来源筛选' }))
  await userEvent.click(screen.getByText('来自团队'))
  expect(screen.queryByText('企业品牌')).toBeNull()
  expect(screen.getByText('团队品牌')).toBeTruthy()
})
it('切换空间后忽略旧请求，不能把甲团队数据覆盖到乙团队', async () => {
  let resolveA!: (items: KnowledgeData[]) => void
  api.getKnowledgeList.mockImplementation((id) =>
    id === 'team-a'
      ? new Promise<KnowledgeData[]>((resolve) => {
          resolveA = resolve
        })
      : Promise.resolve([{ _id: 'b', name: '乙团队知识', spaceId: 'team-b', spaceType: 'team' }]),
  )
  render(
    <MemoryRouter>
      <KnowledgeListPage />
    </MemoryRouter>,
  )
  await waitFor(() => expect(api.getKnowledgeList).toHaveBeenCalledWith('team-a'))
  act(() => useUserStore.setState({ currentSpaceId: 'team-b', currentSpaceName: '乙团队' }))
  await screen.findByText('乙团队知识')
  await act(async () =>
    resolveA([
      { _id: 'a', name: '甲团队知识', spaceId: 'team-a', spaceType: 'team', isRequired: false },
    ]),
  )
  expect(screen.queryByText('甲团队知识')).toBeNull()
  expect(screen.getByText('乙团队知识')).toBeTruthy()
})
