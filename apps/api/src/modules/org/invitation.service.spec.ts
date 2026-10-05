import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { Types } from 'mongoose'
import { Role, spacePermissions } from '@brand-flow/contracts'
import { AuthorizationService } from './authorization.service'
import { InvitationService } from './invitation.service'

describe('邀请生命周期', () => {
  const userId = new Types.ObjectId().toString()
  const enterpriseId = new Types.ObjectId().toString()
  const id = new Types.ObjectId()
  const space = {
    spaceId: enterpriseId,
    enterpriseId,
    spaceType: 'enterprise' as const,
    role: Role.OWNER,
    permissions: spacePermissions('enterprise', Role.OWNER),
    name: '测试企业',
    status: 'active',
  }
  const user = { email: 'target@example.test' }
  const users = { findById: jest.fn(), findOne: jest.fn() }
  const invitations = { findOne: jest.fn(), updateMany: jest.fn(), create: jest.fn() }
  const memberships = {
    transaction: jest.fn(),
    findMembership: jest.fn(),
    joinInvitation: jest.fn(),
  }
  const policy = new AuthorizationService({} as never, {} as never, {} as never)
  const service = new InvitationService(
    invitations as never,
    users as never,
    policy,
    memberships as never,
  )
  let invitation: {
    _id: Types.ObjectId
    spaceId: string
    spaceName: string
    enterpriseId: Types.ObjectId
    inviterId: Types.ObjectId
    inviteeEmail: string
    targetRole: Role
    tokenHash: string
    status: string
    expiresAt: Date
    save: jest.Mock
  }

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    jest.spyOn(policy, 'assertCanManageMembers').mockResolvedValue(space)
    memberships.transaction.mockImplementation(async (_enterpriseId, operation) => operation({}))
    users.findById.mockResolvedValue(user)
    users.findOne.mockResolvedValue(null)
    invitation = {
      _id: id,
      spaceId: enterpriseId,
      spaceName: space.name,
      enterpriseId: new Types.ObjectId(enterpriseId),
      inviterId: new Types.ObjectId(userId),
      inviteeEmail: user.email,
      targetRole: Role.MEMBER,
      tokenHash: createHash('sha256').update('valid').digest('hex'),
      status: 'pending',
      expiresAt: new Date(Date.now() + 60000),
      save: jest.fn(),
    }
    invitations.findOne.mockReturnValue(
      Object.assign(Promise.resolve(invitation), {
        select: jest.fn().mockResolvedValue(invitation),
      }),
    )
    invitations.create.mockImplementation(async ([value]) => [{ ...value, _id: id }])
  })

  it('未注册邮箱可邀请，返回一次性邀请码但数据库仅保存哈希，不直接加入', async () => {
    const result = await service.create(userId, enterpriseId, { email: 'TARGET@example.test' })
    const stored = invitations.create.mock.calls[0][0][0]
    expect(stored.inviteeEmail).toBe(user.email)
    expect(stored.tokenHash).toBe(createHash('sha256').update(result.inviteCode).digest('hex'))
    expect(JSON.stringify(result.invitation)).not.toContain('tokenHash')
    expect(memberships.joinInvitation).not.toHaveBeenCalled()
  })

  it('禁止 OWNER 邀请，并将重复待处理邀请转换为 409', async () => {
    await expect(
      service.create(userId, enterpriseId, { email: user.email, role: Role.OWNER }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    invitations.create.mockRejectedValue({ code: 11000 })
    await expect(
      service.create(userId, enterpriseId, { email: user.email }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('接受时验证账号邮箱和邀请码，再将成员与邀请状态保存到同一事务', async () => {
    await expect(
      service.respond(userId, id.toString(), 'accepted', 'wrong'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(memberships.joinInvitation).not.toHaveBeenCalled()
    await service.respond(userId, id.toString(), 'accepted', 'valid')
    expect(invitations.findOne).toHaveBeenCalledWith({
      _id: id.toString(),
      inviteeEmail: user.email,
    })
    expect(memberships.joinInvitation).toHaveBeenCalledTimes(1)
    expect(invitation.status).toBe('accepted')
    expect(invitation.save).toHaveBeenCalledWith({ session: {} })
    await service.respond(userId, id.toString(), 'accepted')
    expect(memberships.joinInvitation).toHaveBeenCalledTimes(1)
  })

  it('邀请人权限已撤销、邀请已过期或属于其他邮箱时，不能接受', async () => {
    jest.spyOn(policy, 'assertCanManageMembers').mockRejectedValue(new ForbiddenException())
    await expect(service.respond(userId, id.toString(), 'accepted')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(invitation.status).toBe('pending')
    invitation.status = 'expired'
    await expect(service.respond(userId, id.toString(), 'accepted')).rejects.toBeInstanceOf(
      ConflictException,
    )
    invitations.findOne.mockResolvedValue(null)
    await expect(service.respond(userId, id.toString(), 'accepted')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(invitation.save).not.toHaveBeenCalled()
  })

  it('拒绝与撤销不产生成员；撤销仅查本人发出的邀请', async () => {
    await service.respond(userId, id.toString(), 'rejected')
    expect(invitation.status).toBe('rejected')
    invitation.status = 'pending'
    await service.cancel(userId, id.toString())
    expect(invitation.status).toBe('cancelled')
    expect(invitations.findOne).toHaveBeenCalledWith({
      _id: id.toString(),
      inviterId: new Types.ObjectId(userId),
    })
    expect(memberships.joinInvitation).not.toHaveBeenCalled()
  })
})
