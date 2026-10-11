import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { Role, spacePermissions } from '@brand-flow/contracts'
import { TasksService } from './tasks.service'
import { CreateTaskDto } from './dto/tasks.dto'

describe('Task 租户、角色与版本竞争', () => {
  const actor = new Types.ObjectId().toString()
  const assignee = new Types.ObjectId().toString()
  const teamId = new Types.ObjectId().toString()
  const enterpriseId = new Types.ObjectId().toString()
  const id = new Types.ObjectId().toString()
  const session = {}
  const model = {
    db: { transaction: jest.fn(async (fn) => fn(session)) },
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  }
  const policy = { assertCanReadSpace: jest.fn() }
  const activity = { record: jest.fn() }
  const service = new TasksService(model as never, policy as never, activity as never)
  const task = {
    _id: new Types.ObjectId(id),
    enterpriseId: new Types.ObjectId(enterpriseId),
    teamId: new Types.ObjectId(teamId),
    creatorId: new Types.ObjectId(actor),
    assigneeId: new Types.ObjectId(assignee),
    status: 'pending',
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  beforeEach(() => {
    jest.clearAllMocks()
    policy.assertCanReadSpace.mockResolvedValue({
      spaceType: 'team',
      spaceId: teamId,
      enterpriseId,
      role: Role.MEMBER,
      permissions: spacePermissions('team', Role.MEMBER),
    })
    model.findOne.mockResolvedValue(task)
    model.findOneAndUpdate.mockResolvedValue({ ...task, status: 'accepted', version: 1 })
  })
  it('查询同时限定企业与团队', async () => {
    await service.detail(assignee, id, teamId)
    expect(model.findOne.mock.calls[0][0]).toEqual({
      _id: id,
      enterpriseId: new Types.ObjectId(enterpriseId),
      teamId: new Types.ObjectId(teamId),
    })
    model.findOne.mockResolvedValue(null)
    await expect(service.detail(assignee, id, teamId)).rejects.toBeInstanceOf(NotFoundException)
  })
  it('非负责人不能接受', async () => {
    await expect(
      service.command(actor, id, { teamId, version: 0 }, 'accept'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(model.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('Viewer 即使是负责人也不能接受', async () => {
    policy.assertCanReadSpace.mockResolvedValue({
      spaceType: 'team',
      spaceId: teamId,
      enterpriseId,
      role: Role.VIEWER,
      permissions: spacePermissions('team', Role.VIEWER),
    })
    await expect(
      service.command(assignee, id, { teamId, version: 0 }, 'accept'),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('Member 不能创建与派发', async () => {
    await expect(
      service.create(actor, {
        teamId,
        title: '任务',
        requirementSnapshot: { prompt: '生成品牌海报', needsComposition: false },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      service.command(assignee, id, { teamId, version: 0 }, 'assign', actor),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('接受与取消竞争只允许一个 CAS 成功', async () => {
    policy.assertCanReadSpace.mockResolvedValue({
      spaceType: 'team',
      spaceId: teamId,
      enterpriseId,
      role: Role.ADMIN,
      permissions: spacePermissions('team', Role.ADMIN),
    })
    let claimed = false
    model.findOneAndUpdate.mockImplementation(async (filter) => {
      expect(filter).toMatchObject({
        version: 0,
        status: 'pending',
        enterpriseId: new Types.ObjectId(enterpriseId),
        teamId: new Types.ObjectId(teamId),
      })
      if (claimed) return null
      claimed = true
      return { ...task, status: 'accepted', version: 1 }
    })
    const results = await Promise.allSettled([
      service.command(assignee, id, { teamId, version: 0 }, 'accept'),
      service.command(actor, id, { teamId, version: 0 }, 'cancel'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(ConflictException),
    })
    expect(activity.record).toHaveBeenCalledTimes(1)
  })
  it('拒绝必须有原因，回草稿并移除负责人', async () => {
    await expect(
      service.command(assignee, id, { teamId, version: 0 }, 'decline', undefined, ' '),
    ).rejects.toBeInstanceOf(BadRequestException)
    await service.command(assignee, id, { teamId, version: 0 }, 'decline', undefined, '时间不够')
    expect(model.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
      $set: { status: 'draft', declineReason: '时间不够' },
      $unset: { assigneeId: 1 },
    })
  })
  it('DTO 移除客户端伪造的身份、状态与审核权限', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true })
    const dto = await pipe.transform(
      {
        teamId,
        title: '任务',
        creatorId: assignee,
        reviewerId: assignee,
        status: 'completed',
        requirementSnapshot: { prompt: '海报', needsComposition: false },
      },
      { type: 'body', metatype: CreateTaskDto },
    )
    expect(dto).not.toHaveProperty('creatorId')
    expect(dto).not.toHaveProperty('reviewerId')
    expect(dto).not.toHaveProperty('status')
  })
})
