import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Types } from 'mongoose'
import { Role, spacePermissions } from '@brand-flow/contracts'
import { AuthorizationService, type AuthorizedSpace } from './authorization.service'
import { MembershipService } from './membership.service'

describe('成员生命周期', () => {
  const enterpriseId = new Types.ObjectId().toString()
  const teamId = new Types.ObjectId().toString()
  const actorId = new Types.ObjectId().toString()
  const targetId = new Types.ObjectId().toString()
  const session = { transaction: true }
  let space: AuthorizedSpace
  const target = {
    memberships: [{ enterpriseId: new Types.ObjectId(enterpriseId), role: Role.MEMBER }],
    save: jest.fn(),
    set: jest.fn(),
  }
  const actor = {
    memberships: [{ enterpriseId: new Types.ObjectId(enterpriseId), role: Role.OWNER }],
    save: jest.fn(),
  }
  const users = { findOne: jest.fn(), findById: jest.fn(), db: { transaction: jest.fn() } }
  const enterprises = { findByIdAndUpdate: jest.fn() }
  const policy = new AuthorizationService({} as never, {} as never, {} as never)
  const service = new MembershipService(
    users as never,
    enterprises as never,
    policy,
    new ConfigService(),
    { record: jest.fn() } as never,
  )

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    space = {
      spaceId: enterpriseId,
      enterpriseId,
      spaceType: 'enterprise',
      role: Role.OWNER,
      permissions: spacePermissions('enterprise', Role.OWNER),
      name: '企业',
      status: 'active',
    }
    jest.spyOn(policy, 'assertCanManageMembers').mockImplementation(async () => space)
    jest.spyOn(policy, 'assertCanReadOrganization').mockImplementation(async () => space)
    jest.spyOn(policy, 'assertCanTransferOwnership').mockImplementation(async () => {
      if (!space.permissions.transferOwnership) throw new ForbiddenException()
      return space
    })
    users.db.transaction.mockImplementation(async (operation) => operation(session))
    enterprises.findByIdAndUpdate.mockResolvedValue({ _id: enterpriseId })
    target.memberships = [{ enterpriseId: new Types.ObjectId(enterpriseId), role: Role.MEMBER }]
    actor.memberships[0].role = Role.OWNER
    users.findOne.mockResolvedValue(target)
    users.findById.mockResolvedValue(actor)
  })

  it('管理员可调整普通成员，但不能授予 ADMIN、修改管理员或 OWNER', async () => {
    space.role = Role.ADMIN
    space.permissions = spacePermissions('enterprise', Role.ADMIN)
    await service.changeRole(actorId, enterpriseId, targetId, Role.VIEWER)
    expect(target.memberships[0].role).toBe(Role.VIEWER)
    await expect(
      service.changeRole(actorId, enterpriseId, targetId, Role.ADMIN),
    ).rejects.toBeInstanceOf(ForbiddenException)
    target.memberships[0].role = Role.ADMIN
    await expect(service.remove(actorId, enterpriseId, targetId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    target.memberships[0].role = Role.OWNER
    await expect(
      service.changeRole(actorId, enterpriseId, targetId, Role.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('OWNER 不能退出、移除或降级；转移必须同时保存双方角色', async () => {
    target.memberships[0].role = Role.OWNER
    await expect(service.remove(targetId, enterpriseId, targetId, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(service.remove(actorId, enterpriseId, targetId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    target.memberships[0].role = Role.MEMBER
    await service.transferOwner(actorId, enterpriseId, targetId)
    expect(actor.memberships[0].role).toBe(Role.ADMIN)
    expect(target.memberships[0].role).toBe(Role.OWNER)
    expect(actor.save).toHaveBeenCalledWith({ session })
    expect(target.save).toHaveBeenCalledWith({ session })
  })

  it('转移不接受仅有团队 membership 的账号', async () => {
    users.findOne.mockResolvedValue({
      memberships: [
        {
          enterpriseId: new Types.ObjectId(enterpriseId),
          teamId: new Types.ObjectId(teamId),
          role: Role.MEMBER,
        },
      ],
    })
    await expect(service.transferOwner(actorId, enterpriseId, targetId)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(actor.save).not.toHaveBeenCalled()
  })

  it('退出企业同时清除团队关系，其他企业保留', async () => {
    const foreignId = new Types.ObjectId()
    users.findOne.mockResolvedValue({
      ...target,
      memberships: [
        ...target.memberships,
        {
          enterpriseId: new Types.ObjectId(enterpriseId),
          teamId: new Types.ObjectId(teamId),
          role: Role.MEMBER,
        },
        { enterpriseId: foreignId, role: Role.MEMBER },
      ],
    })
    await service.remove(targetId, enterpriseId, targetId, true)
    const result = await users.findOne.mock.results[0].value
    expect(result.memberships).toEqual([{ enterpriseId: foreignId, role: Role.MEMBER }])
  })

  it('事务失败向上抛出，独立 Mongo 明确报告副本集要求', async () => {
    users.db.transaction.mockRejectedValue({ code: 20 })
    await expect(
      service.changeRole(actorId, enterpriseId, targetId, Role.MEMBER),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(target.save).not.toHaveBeenCalled()
  })

  it('接受团队邀请补齐企业 membership，重复接受不覆盖后来调整的角色', async () => {
    space.spaceType = 'team'
    space.spaceId = teamId
    const user = { memberships: [], save: jest.fn() }
    await service.joinInvitation(user as never, space, Role.VIEWER, session as never)
    expect(user.memberships).toHaveLength(2)
    expect(
      service.findMembership(user as never, {
        ...space,
        spaceType: 'enterprise',
        spaceId: enterpriseId,
      })?.role,
    ).toBe(Role.VIEWER)
    await service.joinInvitation(user as never, space, Role.ADMIN, session as never)
    expect(user.memberships).toHaveLength(2)
    expect(service.findMembership(user as never, space)?.role).toBe(Role.VIEWER)
  })
})
