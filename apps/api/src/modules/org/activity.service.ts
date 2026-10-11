import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type { ClientSession } from 'mongoose'
import type { SpaceType } from '@brand-flow/contracts'
import { assertObjectId } from '@/common/personal-scope'
import { AuthorizationService } from './authorization.service'
import { AuditLog, Notification } from './schemas/activity.schema'
import type { AuditLogDocument, NotificationDocument } from './schemas/activity.schema'

interface ActivityScope {
  enterpriseId?: string
  spaceId: string
  spaceType: SpaceType
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(AuditLog.name) private readonly audits: Model<AuditLogDocument>,
    @InjectModel(Notification.name) private readonly notifications: Model<NotificationDocument>,
    private readonly authorization: AuthorizationService,
  ) {}

  async record(
    actorId: string,
    scope: ActivityScope,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: { role?: string; status?: string; isRequired?: boolean } = {},
    session?: ClientSession,
    recipients: string[] = [],
  ): Promise<void> {
    if (scope.spaceType === 'personal') return
    assertObjectId(actorId)
    assertObjectId(scope.enterpriseId!)
    const context = {
      enterpriseId: new Types.ObjectId(scope.enterpriseId),
      ...(scope.spaceType === 'team' ? { teamId: new Types.ObjectId(scope.spaceId) } : {}),
    }
    // 仅保存明确允许的状态字段，不记录邀请码、邮箱、正文或客户端任意 metadata。
    const redacted = Object.fromEntries(
      ['role', 'status', 'isRequired']
        .filter((key) => Reflect.get(metadata, key) !== undefined)
        .map((key) => [key, Reflect.get(metadata, key)]),
    )
    await this.audits.create(
      [
        {
          ...context,
          actorId: new Types.ObjectId(actorId),
          action,
          resourceType,
          resourceId,
          metadata: redacted,
        },
      ],
      { session },
    )
    if (recipients.length)
      await this.notifications.create(
        [...new Set(recipients)].map((id) => ({
          ...context,
          recipientId: new Types.ObjectId(id),
          action,
          resourceId,
        })),
        { session, ordered: true },
      )
  }

  async listAudits(userId: string, spaceId: string, before?: string) {
    const scope = await this.authorization.assertCanReadOrganization(userId, spaceId)
    if (scope.spaceType === 'personal') throw new BadRequestException('个人空间没有组织审计')
    if (!scope.permissions.manageOrganization)
      throw new ForbiddenException('仅空间管理员可读取审计')
    if (before) assertObjectId(before)
    return this.audits
      .find({
        enterpriseId: new Types.ObjectId(scope.enterpriseId),
        ...(scope.spaceType === 'team' ? { teamId: new Types.ObjectId(spaceId) } : {}),
        ...(before ? { _id: { $lt: new Types.ObjectId(before) } } : {}),
      })
      .sort({ _id: -1 })
      .limit(50)
      .lean()
  }

  async listNotifications(userId: string) {
    return this.notifications
      .find({ recipientId: new Types.ObjectId(userId) })
      .sort({ _id: -1 })
      .limit(50)
      .lean()
  }

  async taskTimeline(userId: string, teamId: string, taskId: string) {
    assertObjectId(taskId)
    const scope = await this.authorization.assertCanReadSpace(userId, teamId)
    if (scope.spaceType !== 'team') throw new BadRequestException('任务必须属于团队')
    return this.audits
      .find({ enterpriseId: scope.enterpriseId, teamId, resourceType: 'task', resourceId: taskId })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return {
      count: await this.notifications.countDocuments({
        recipientId: new Types.ObjectId(userId),
        readAt: { $exists: false },
      }),
    }
  }

  async markRead(userId: string, id: string): Promise<{ success: true }> {
    assertObjectId(id)
    const result = await this.notifications.updateOne(
      { _id: id, recipientId: new Types.ObjectId(userId) },
      { $set: { readAt: new Date() } },
    )
    if (!result.matchedCount) throw new NotFoundException('通知不存在')
    return { success: true }
  }
}
