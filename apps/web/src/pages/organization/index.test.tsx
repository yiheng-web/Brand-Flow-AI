import { mockComputedStyle } from '../../../test/computed-style'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role, spacePermissions } from '@brand-flow/contracts'
import { useUserStore } from '@/store/useUserStore'
import { useAuthStore } from '@/store/useAuthStore'
import OrganizationPage from './index'

const api = vi.hoisted(() => ({
  getMyEnterprises: vi.fn(),
  getMySpaces: vi.fn(),
  getTeams: vi.fn(),
  getSpaceMembers: vi.fn(),
  createEnterprise: vi.fn(),
  createTeam: vi.fn(),
  updateEnterprise: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
  inviteSpaceMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveSpace: vi.fn(),
  transferOwner: vi.fn(),
  switchEnterprise: vi.fn(),
}))
vi.mock('@/api/org', () => api)
const enterprise = {
  enterpriseId: 'enterprise',
  name: '测试企业',
  role: Role.OWNER,
  status: 'active',
  permissions: spacePermissions('enterprise', Role.OWNER),
}
const renderPage = () =>
  render(
    <MemoryRouter>
      <OrganizationPage />
    </MemoryRouter>,
  )
describe('组织生命周期页面', () => {
  beforeEach(() => {
    mockComputedStyle()
    Object.values(api).forEach((mock) => mock.mockReset())
    useUserStore.setState(useUserStore.getInitialState(), true)
    useAuthStore.setState({ user: { id: 'owner', name: 'Owner', email: 'owner@example.test' } })
    api.getMyEnterprises.mockResolvedValue([enterprise])
    api.getMySpaces.mockResolvedValue([
      { spaceId: 'enterprise', type: 'enterprise', ...enterprise },
    ])
    api.getTeams.mockResolvedValue([])
    api.getSpaceMembers.mockResolvedValue([
      { userId: 'owner', email: 'owner@example.test', role: 'owner' },
      { userId: 'member', email: 'member@example.test', role: 'member' },
    ])
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('无组织用户可自助创建企业', async () => {
    api.getMyEnterprises.mockResolvedValue([])
    api.getMySpaces.mockResolvedValue([])
    api.createEnterprise.mockResolvedValue({})
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '创建企业' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新企业' } })
    fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }))
    await waitFor(() =>
      expect(api.createEnterprise).toHaveBeenCalledWith({ name: '新企业', logo: undefined }),
    )
    expect(await screen.findByText('企业创建成功')).toBeTruthy()
  })

  it('创建持久化邀请，不宣称成员已经加入；操作后刷新组织', async () => {
    api.inviteSpaceMember.mockResolvedValue({})
    renderPage()
    const invite = await screen.findByRole('button', { name: '邀请成员' })
    await waitFor(() => expect(invite.hasAttribute('disabled')).toBe(false))
    fireEvent.click(invite)
    fireEvent.change(screen.getByLabelText('成员邮箱'), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }))
    await waitFor(() =>
      expect(api.inviteSpaceMember).toHaveBeenCalledWith('enterprise', {
        email: 'new@example.test',
        role: 'member',
      }),
    )
    expect(await screen.findByText(/邀请已创建；对方注册后/)).toBeTruthy()
    expect(api.getMySpaces.mock.calls.length).toBeGreaterThan(1)
  })

  it('成员禁用组织管理和角色调整；OWNER 退出按钮禁用', async () => {
    renderPage()
    await screen.findAllByText('owner@example.test')
    expect(screen.getByRole('button', { name: '退出企业' }).hasAttribute('disabled')).toBe(true)
    cleanup()
    useUserStore.setState(useUserStore.getInitialState(), true)
    api.getMyEnterprises.mockResolvedValue([
      {
        ...enterprise,
        role: Role.MEMBER,
        permissions: spacePermissions('enterprise', Role.MEMBER),
      },
    ])
    renderPage()
    await screen.findAllByText('member@example.test')
    expect(screen.getByRole('button', { name: '编辑企业' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '转移所有权' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '邀请成员' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('combobox', { name: /修改 .* 的角色/ })).toBeNull()
  })

  it('进入团队先更新企业 JWT，再切换当前空间', async () => {
    api.getTeams.mockResolvedValue([
      {
        _id: 'team',
        enterpriseId: 'enterprise',
        name: '设计团队',
        status: 'active',
        role: Role.OWNER,
        permissions: spacePermissions('team', Role.OWNER),
      },
    ])
    api.getMySpaces.mockResolvedValue([
      {
        spaceId: 'team',
        type: 'team',
        name: '设计团队',
        enterpriseId: 'enterprise',
        permissions: spacePermissions('team', Role.OWNER),
      },
    ])
    api.switchEnterprise.mockResolvedValue({ access_token: 'new-enterprise-token' })
    renderPage()
    const enter = await screen.findByRole('button', { name: '进入空间' })
    fireEvent.click(enter)
    await waitFor(() => expect(api.switchEnterprise).toHaveBeenCalledWith('enterprise'))
    await waitFor(() => expect(useAuthStore.getState().token).toBe('new-enterprise-token'))
    expect(useUserStore.getState().currentSpaceId).toBe('team')
  })

  it('详情请求失败提供错误与重试', async () => {
    api.getTeams.mockRejectedValueOnce(new Error('团队加载失败'))
    renderPage()
    expect(await screen.findByText('团队加载失败')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    await screen.findAllByText('member@example.test')
    expect(api.getTeams.mock.calls.length).toBeGreaterThan(1)
  })

  it('刷新已移除空间回到个人空间，资料编辑后名称同步更新', () => {
    const store = useUserStore.getState()
    store.setSpaces([
      { id: 'personal', name: '个人空间', type: 'personal', description: '' },
      { id: 'team', name: '旧团队', type: 'team', description: '' },
    ])
    store.setCurrentSpace('team')
    store.setSpaces([{ id: 'team', name: '新团队', type: 'team', description: '' }])
    expect(useUserStore.getState().currentSpaceName).toBe('新团队')
    store.setSpaces([{ id: 'personal', name: '个人空间', type: 'personal', description: '' }])
    expect(useUserStore.getState().currentSpaceId).toBe('personal')
  })
})
