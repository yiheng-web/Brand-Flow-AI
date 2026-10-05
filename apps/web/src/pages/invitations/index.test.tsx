import { mockComputedStyle } from '../../../test/computed-style'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvitationsPage from './index'
import { useUserStore } from '@/store/useUserStore'

const api = vi.hoisted(() => ({
  getInvitations: vi.fn(),
  respondInvitation: vi.fn(),
  getMyEnterprises: vi.fn(),
  getMySpaces: vi.fn(),
}))
vi.mock('@/api/org', () => api)
const invitation = {
  id: 'invite',
  spaceId: 'team',
  spaceName: '设计团队',
  enterpriseId: 'enterprise',
  inviterId: 'owner',
  inviteeEmail: 'new@example.test',
  targetRole: 'member',
  status: 'pending',
  expiresAt: '2030-10-10T00:00:00Z',
  canRespond: true,
  canCancel: false,
}
const renderPage = () =>
  render(
    <MemoryRouter>
      <InvitationsPage />
    </MemoryRouter>,
  )
describe('邀请中心', () => {
  beforeEach(() => {
    mockComputedStyle()
    Object.values(api).forEach((mock) => mock.mockReset())
    useUserStore.setState(useUserStore.getInitialState(), true)
    api.getInvitations.mockResolvedValue([invitation])
    api.getMyEnterprises.mockResolvedValue([])
    api.getMySpaces.mockResolvedValue([])
    api.respondInvitation.mockResolvedValue({ ...invitation, status: 'accepted' })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(['accept', 'reject'] as const)(
    '收到的邀请可 %s，处理后重新读取服务端并刷新空间',
    async (action) => {
      renderPage()
      fireEvent.click(
        await screen.findByRole('button', { name: action === 'accept' ? /接\s*受/ : /拒\s*绝/ }),
      )
      await waitFor(() => expect(api.respondInvitation).toHaveBeenCalledWith('invite', action))
      await waitFor(() => expect(api.getInvitations).toHaveBeenCalledTimes(2))
      expect(api.getMySpaces).toHaveBeenCalledTimes(1)
    },
  )

  it('发出的邀请仅在服务端允许时显示撤销', async () => {
    api.getInvitations.mockImplementation(async (direction) =>
      direction === 'sent' ? [{ ...invitation, canRespond: false, canCancel: true }] : [],
    )
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '发出的邀请' }))
    fireEvent.click(await screen.findByRole('button', { name: /撤\s*销/ }))
    await waitFor(() => expect(api.respondInvitation).toHaveBeenCalledWith('invite', 'cancel'))
    expect(screen.queryByRole('button', { name: /接\s*受/ })).toBeNull()
  })

  it('过期或已处理邀请不提供操作，失败可重试', async () => {
    api.getInvitations
      .mockRejectedValueOnce(new Error('邀请加载失败'))
      .mockResolvedValue([{ ...invitation, status: 'expired', canRespond: false }])
    renderPage()
    await screen.findByText('邀请加载失败')
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByText('已过期')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /接\s*受/ })).toBeNull()
  })
})
