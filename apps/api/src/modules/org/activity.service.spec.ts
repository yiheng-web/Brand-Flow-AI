import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'
import { ActivityService } from './activity.service'
import { AuditLogSchema, NotificationSchema } from './schemas/activity.schema'

describe('组织审计和通知边界', () => {
  const actorId = new Types.ObjectId().toString()
  const enterpriseId = new Types.ObjectId().toString()
  const teamId = new Types.ObjectId().toString()
  const scope = { spaceType: 'team' as const, spaceId: teamId, enterpriseId }
  const audits = { create: jest.fn(), find: jest.fn() }
  const notifications = { create: jest.fn(), countDocuments: jest.fn(), updateOne: jest.fn() }
  const authorization = { assertCanReadOrganization: jest.fn() }
  const service = new ActivityService(
    audits as never,
    notifications as never,
    authorization as never,
  )

  beforeEach(() => jest.clearAllMocks())

  it('审计与通知的身份/租户关联都是可查询的 ObjectId', () => {
    for (const path of ['actorId', 'enterpriseId', 'teamId'])
      expect(AuditLogSchema.path(path).instance).toBe('ObjectId')
    for (const path of ['recipientId', 'enterpriseId', 'teamId'])
      expect(NotificationSchema.path(path).instance).toBe('ObjectId')
  })

  it('审计与通知传递同一事务且不保存任意敏感 metadata', async () => {
    const session = {} as never
    const metadata = { role: 'member', token: 'secret', inviteCode: 'secret', content: 'private' }
    await service.record(
      actorId,
      scope,
      'member.role_changed',
      'user',
      actorId,
      metadata,
      session,
      [actorId, actorId],
    )
    expect(audits.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          actorId: new Types.ObjectId(actorId),
          enterpriseId: new Types.ObjectId(enterpriseId),
          teamId: new Types.ObjectId(teamId),
          metadata: { role: 'member' },
        }),
      ],
      { session },
    )
    expect(notifications.create.mock.calls[0][0]).toHaveLength(1)
    expect(notifications.create.mock.calls[0][1]).toEqual({ session, ordered: true })
  })

  it('普通成员不能读取审计', async () => {
    authorization.assertCanReadOrganization.mockResolvedValue({
      ...scope,
      permissions: { manageOrganization: false },
    })
    await expect(service.listAudits(actorId, teamId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(audits.find).not.toHaveBeenCalled()
  })

  it('通知已读与计数查询强制限定当前收件人', async () => {
    notifications.countDocuments.mockResolvedValue(2)
    expect(await service.unreadCount(actorId)).toEqual({ count: 2 })
    expect(notifications.countDocuments).toHaveBeenCalledWith({
      recipientId: new Types.ObjectId(actorId),
      readAt: { $exists: false },
    })
    notifications.updateOne.mockResolvedValue({ matchedCount: 0 })
    await expect(service.markRead(actorId, teamId)).rejects.toBeInstanceOf(NotFoundException)
    expect(notifications.updateOne.mock.calls[0][0]).toEqual({
      _id: teamId,
      recipientId: new Types.ObjectId(actorId),
    })
  })

  it('审计失败阻止通知写入并向事务调用方传播', async () => {
    audits.create.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(
      service.record(actorId, scope, 'member.removed', 'user', actorId, {}, {} as never, [actorId]),
    ).rejects.toThrow('audit unavailable')
    expect(notifications.create).not.toHaveBeenCalled()
  })
})
