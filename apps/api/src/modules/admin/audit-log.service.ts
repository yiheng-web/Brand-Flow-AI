import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema'
import { AuditLogQueryDto } from './dto/admin-query.dto'

interface WriteAuditLogInput {
  actor: {
    userId: string
    email: string
    platformRole: string
  }
  action: string
  targetType: string
  targetId?: string
  targetName?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  ip?: string
  userAgent?: string
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async write(input: WriteAuditLogInput) {
    await this.auditLogModel.create({
      actorUserId: new Types.ObjectId(input.actor.userId),
      actorEmail: input.actor.email,
      actorRole: input.actor.platformRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      targetName: input.targetName,
      before: input.before,
      after: input.after,
      ip: input.ip,
      userAgent: input.userAgent,
    })
  }

  async list(query: AuditLogQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    const filter: Record<string, any> = {}

    if (query.actor) {
      filter.actorEmail = { $regex: query.actor, $options: 'i' }
    }

    if (query.action) {
      filter.action = query.action
    }

    if (query.targetType) {
      filter.targetType = query.targetType
    }

    const [items, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.auditLogModel.countDocuments(filter),
    ])

    return {
      items: items.map((item: any) => ({
        id: item._id.toString(),
        actor: item.actorEmail,
        action: item.action,
        targetType: item.targetType,
        targetName: item.targetName,
        createdAt: item.createdAt,
      })),
      total,
    }
  }
}
