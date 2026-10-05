import { ForbiddenException } from '@nestjs/common'
import { Types } from 'mongoose'
import { Role } from '@brand-flow/contracts'
import { AuthorizationService } from './authorization.service'
import { OrgService } from './org.service'
import { AssetsService } from '../assets/assets.service'
import { KnowledgeService } from '../knowledge/knowledge.service'
import { WorkflowService } from '../workflow/workflow.service'
import { OwnerType, Visibility } from '@/common/enums'

describe('组织空间统一 RBAC', () => {
  const userId = new Types.ObjectId().toString()
  const enterpriseId = new Types.ObjectId().toString()
  const teamId = new Types.ObjectId().toString()
  const foreignEnterpriseId = new Types.ObjectId().toString()
  const foreignTeamId = new Types.ObjectId().toString()
  const userModel = { findById: jest.fn(), findOne: jest.fn() }
  const teamModel = { findById: jest.fn() }
  const enterpriseModel = { findById: jest.fn() }
  const policy = new AuthorizationService(
    userModel as never,
    teamModel as never,
    enterpriseModel as never,
  )
  const org = new OrgService(
    enterpriseModel as never,
    userModel as never,
    teamModel as never,
    {} as never,
    policy,
  )
  const model = { create: jest.fn(), findOne: jest.fn(), findByIdAndDelete: jest.fn() }
  const assets = new AssetsService(model as never, policy, {} as never, {} as never)
  const knowledge = new KnowledgeService(model as never, {} as never, org)
  const workflow = new WorkflowService(
    model as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    policy,
  )

  function member(role: Role, inTeam = true) {
    userModel.findById.mockResolvedValue({
      memberships: [
        { enterpriseId: new Types.ObjectId(enterpriseId), role },
        ...(inTeam
          ? [
              {
                enterpriseId: new Types.ObjectId(enterpriseId),
                teamId: new Types.ObjectId(teamId),
                role,
              },
            ]
          : []),
      ],
    })
  }

  beforeEach(() => {
    jest.resetAllMocks()
    teamModel.findById.mockImplementation(async (id: string) => {
      if (id === teamId) return { _id: teamId, enterpriseId: new Types.ObjectId(enterpriseId) }
      if (id === foreignTeamId)
        return { _id: foreignTeamId, enterpriseId: new Types.ObjectId(foreignEnterpriseId) }
      return null
    })
    enterpriseModel.findById.mockImplementation(async (id: string) => ({ _id: id }))
  })

  for (const role of Object.values(Role)) {
    for (const type of ['personal', 'team', 'enterprise'] as const) {
      it(`${role} × ${type} 权限矩阵`, async () => {
        member(role)
        const id = type === 'personal' ? 'personal' : type === 'team' ? teamId : enterpriseId
        const expectedRole = type === 'personal' ? Role.OWNER : role
        const manager = expectedRole === Role.OWNER || expectedRole === Role.ADMIN
        const write = expectedRole !== Role.VIEWER
        const result = await policy.assertCanReadSpace(userId, id)
        expect(result.permissions).toEqual({
          read: true,
          write,
          manageMembers: type !== 'personal' && manager,
          manageKnowledge: manager,
          manageAssets: manager,
          manageWorks: write,
          assignTasks: type !== 'personal' && manager,
        })
        for (const [action, allowed] of [
          [policy.assertCanWriteSpace, write],
          [policy.assertCanManageKnowledge, manager],
          [policy.assertCanManageAssets, manager],
          [policy.assertCanManageWorks, write],
          [policy.assertCanManageMembers, type !== 'personal' && manager],
          [policy.assertCanAssignTasks, type !== 'personal' && manager],
        ] as const) {
          if (allowed) await expect(action.call(policy, userId, id)).resolves.toBeDefined()
          else
            await expect(action.call(policy, userId, id)).rejects.toBeInstanceOf(ForbiddenException)
        }
      })
    }
  }

  it.each([Role.MEMBER, Role.VIEWER])(
    '非团队成员 %s 不可访问或创建 team workflow',
    async (role) => {
      member(role, false)
      await expect(policy.assertCanReadSpace(userId, teamId)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      await expect(
        workflow.create({ spaceId: teamId, prompt: '测试' }, userId),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(model.create).not.toHaveBeenCalled()
    },
  )

  it.each([Role.OWNER, Role.ADMIN])(
    '%s 管理员可穿透本企业团队，但不能访问其他企业',
    async (role) => {
      member(role, false)
      await expect(policy.assertCanManageAssets(userId, teamId)).resolves.toBeDefined()
      for (const id of [foreignEnterpriseId, foreignTeamId]) {
        await expect(policy.assertCanReadSpace(userId, id)).rejects.toBeInstanceOf(
          ForbiddenException,
        )
        await expect(policy.assertCanWriteSpace(userId, id)).rejects.toBeInstanceOf(
          ForbiddenException,
        )
      }
    },
  )

  it.each([Role.MEMBER, Role.VIEWER])('%s 永远不能访问 B 企业或团队', async (role) => {
    member(role)
    for (const id of [foreignEnterpriseId, foreignTeamId]) {
      await expect(org.getAccessibleSpace(userId, id)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(knowledge.findAll(userId, id)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(workflow.create({ spaceId: id, prompt: '测试' }, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    }
  })

  it.each([Role.OWNER, Role.ADMIN])('%s 不能通过邀请授予 OWNER', async (role) => {
    member(role)
    await expect(
      org.inviteSpaceMember(userId, enterpriseId, {
        email: 'target@example.test',
        role: Role.OWNER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(userModel.findOne).not.toHaveBeenCalled()
  })

  it('viewer 无法创建、删除 enterprise public asset，创建者不能绕过当前角色', async () => {
    member(Role.VIEWER)
    const dto = {
      name: 'public',
      type: 'logo',
      url: 'test',
      ownerType: OwnerType.ENTERPRISE,
      ownerId: enterpriseId,
      visibility: Visibility.PUBLIC,
    }
    await expect(assets.createAsset(userId, enterpriseId, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    model.findOne.mockResolvedValue({
      ...dto,
      creatorId: new Types.ObjectId(userId),
      enterpriseId: new Types.ObjectId(enterpriseId),
    })
    await expect(
      assets.deleteAsset(userId, new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(model.create).not.toHaveBeenCalled()
    expect(model.findByIdAndDelete).not.toHaveBeenCalled()
  })

  it('拒绝跨企业 teamId、伪 ownerId 及不一致的 visibility', async () => {
    member(Role.ADMIN)
    const dto = {
      name: '测试',
      type: 'logo',
      url: 'test',
      ownerType: OwnerType.TEAM,
      ownerId: foreignTeamId,
      visibility: Visibility.TEAM,
    }
    await expect(assets.createAsset(userId, enterpriseId, dto)).rejects.toThrow()
    await expect(
      assets.createAsset(userId, enterpriseId, {
        ...dto,
        ownerType: OwnerType.ENTERPRISE,
        ownerId: teamId,
        visibility: Visibility.ENTERPRISE,
      }),
    ).rejects.toThrow()
    await expect(
      assets.createAsset(userId, enterpriseId, {
        ...dto,
        ownerId: teamId,
        visibility: Visibility.PUBLIC,
      }),
    ).rejects.toThrow()
    expect(model.create).not.toHaveBeenCalled()
  })

  it('viewer 创建知识库与修改本人创建的企业知识库均被拒绝', async () => {
    member(Role.VIEWER)
    await expect(
      knowledge.create(userId, { spaceId: enterpriseId, name: '规范' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    model.findOne.mockResolvedValue({
      spaceId: enterpriseId,
      spaceType: 'enterprise',
      creatorId: new Types.ObjectId(userId),
    })
    await expect(
      knowledge.update(userId, new Types.ObjectId().toString(), { name: '篡改' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('历史团队 membership 不升级为企业管理员，企业 viewer 不能借团队角色升权', async () => {
    userModel.findById.mockResolvedValue({
      memberships: [
        {
          enterpriseId: new Types.ObjectId(enterpriseId),
          teamId: new Types.ObjectId(teamId),
          role: Role.ADMIN,
        },
      ],
    })
    expect((await policy.assertCanReadSpace(userId, enterpriseId)).role).toBe(Role.VIEWER)
    userModel.findById.mockResolvedValue({
      memberships: [
        { enterpriseId: new Types.ObjectId(enterpriseId), role: Role.VIEWER },
        {
          enterpriseId: new Types.ObjectId(enterpriseId),
          teamId: new Types.ObjectId(teamId),
          role: Role.ADMIN,
        },
      ],
    })
    await expect(policy.assertCanWriteSpace(userId, teamId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('viewer 无法启动、确认、重跑、取消或重试现有工作流', async () => {
    member(Role.VIEWER)
    const id = new Types.ObjectId().toString()
    model.findOne.mockResolvedValue({
      _id: id,
      userId,
      spaceId: enterpriseId,
      spaceType: 'enterprise',
      entId: enterpriseId,
    })
    const actions = [
      () => workflow.start(id, { needsComposition: false }, userId),
      () => workflow.confirmBrief(id, userId),
      () => workflow.regenerateBrief(id, userId),
      () => workflow.runNode(id, 'brief', userId),
      () => workflow.cancel(id, userId),
      () => workflow.retry(id, userId),
    ]
    for (const action of actions) {
      await expect(action()).rejects.toBeInstanceOf(ForbiddenException)
    }
  })

  it('伪造与真实团队企业不一致的 membership 不授予团队权限', async () => {
    userModel.findById.mockResolvedValue({
      memberships: [
        {
          enterpriseId: new Types.ObjectId(enterpriseId),
          teamId: new Types.ObjectId(foreignTeamId),
          role: Role.ADMIN,
        },
      ],
    })
    await expect(policy.assertCanReadSpace(userId, foreignTeamId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
})
