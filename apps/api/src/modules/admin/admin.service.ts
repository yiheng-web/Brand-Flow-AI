import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Enterprise, EnterpriseDocument } from '@/modules/org/schemas/enterprise.schema'
import { Team, TeamDocument } from '@/modules/org/schemas/team.schema'
import { User, UserDocument } from '@/modules/org/schemas/user.schema'
import { AdminListQueryDto, UpdateStatusDto } from './dto/admin-query.dto'
import { AuditLogService } from './audit-log.service'
import {
  KnowledgeItem,
  KnowledgeItemDocument,
} from '@/modules/knowledge/schemas/knowledge-item.schema'

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Enterprise.name)
    private readonly enterpriseModel: Model<EnterpriseDocument>,
    @InjectModel(Team.name) private readonly teamModel: Model<TeamDocument>,
    @InjectModel(KnowledgeItem.name)
    private readonly knowledgeItemModel: Model<KnowledgeItemDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getDashboard() {
    const [users, enterprises, teams, pendingReviews, recentAuditLogs] = await Promise.all([
      this.userModel.countDocuments(),
      this.enterpriseModel.countDocuments(),
      this.teamModel.countDocuments(),
      this.knowledgeItemModel.countDocuments({ status: 'pending_review' }),
      this.auditLogService.list({ page: 1, pageSize: 5 }),
    ])

    return {
      users,
      enterprises,
      teams,
      generationsToday: 0,
      quotaUsed: 0,
      pendingReviews,
      recentAuditLogs: recentAuditLogs.items,
    }
  }

  async listUsers(query: AdminListQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    const filter: Record<string, any> = {}

    if (query.keyword) {
      filter.$or = [
        { email: { $regex: query.keyword, $options: 'i' } },
        { 'profile.nickname': { $regex: query.keyword, $options: 'i' } },
      ]
    }

    if (query.status) {
      filter.status = query.status
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.userModel.countDocuments(filter),
    ])

    return {
      items: items.map((user: any) => this.toManagedUser(user)),
      total,
    }
  }

  async getUser(userId: string) {
    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    return this.toManagedUser(user as any)
  }

  async updateUserStatus(
    admin: any,
    userId: string,
    dto: UpdateStatusDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const before = { status: user.status }
    user.status = dto.status
    await user.save()

    await this.auditLogService.write({
      actor: admin,
      action: dto.status === 'disabled' ? 'DISABLE_USER' : 'ENABLE_USER',
      targetType: 'user',
      targetId: user._id.toString(),
      targetName: user.email,
      before,
      after: { status: user.status },
      ...meta,
    })

    return this.toManagedUser(user as any)
  }

  async listEnterprises(query: AdminListQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    const filter: Record<string, any> = {}

    if (query.keyword) {
      filter.name = { $regex: query.keyword, $options: 'i' }
    }

    if (query.status) {
      filter.status = query.status
    }

    const [enterprises, total] = await Promise.all([
      this.enterpriseModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.enterpriseModel.countDocuments(filter),
    ])

    const items = await Promise.all(
      enterprises.map((enterprise: any) => this.toManagedEnterprise(enterprise)),
    )

    return { items, total }
  }

  async getEnterprise(enterpriseId: string) {
    const enterprise = await this.enterpriseModel.findById(enterpriseId)
    if (!enterprise) {
      throw new NotFoundException('企业不存在')
    }

    return this.toManagedEnterprise(enterprise as any)
  }

  async updateEnterpriseStatus(
    admin: any,
    enterpriseId: string,
    dto: UpdateStatusDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const enterprise = await this.enterpriseModel.findById(enterpriseId)
    if (!enterprise) {
      throw new NotFoundException('企业不存在')
    }

    const before = { status: enterprise.status }
    enterprise.status = dto.status
    await enterprise.save()

    await this.auditLogService.write({
      actor: admin,
      action: dto.status === 'disabled' ? 'DISABLE_ENTERPRISE' : 'ENABLE_ENTERPRISE',
      targetType: 'enterprise',
      targetId: enterprise._id.toString(),
      targetName: enterprise.name,
      before,
      after: { status: enterprise.status },
      ...meta,
    })

    return this.toManagedEnterprise(enterprise as any)
  }

  async listEnterpriseMembers(enterpriseId: string, query: AdminListQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    const filter = { 'memberships.enterpriseId': enterpriseId }
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.userModel.countDocuments(filter),
    ])

    return {
      items: items.map((user: any) => this.toManagedUser(user)),
      total,
    }
  }

  async listEnterpriseTeams(enterpriseId: string, query: AdminListQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    const [items, total] = await Promise.all([
      this.teamModel
        .find({ enterpriseId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.teamModel.countDocuments({ enterpriseId }),
    ])

    return {
      items: items.map((team: any) => ({
        id: team._id.toString(),
        name: team.name,
        description: team.description,
        status: 'active',
        createdAt: team.createdAt,
      })),
      total,
    }
  }

  async listReviewQueue(query: AdminListQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    const filter: Record<string, any> = { status: 'pending_review' }

    if (query.keyword) {
      filter.title = { $regex: query.keyword, $options: 'i' }
    }

    const [items, total] = await Promise.all([
      this.knowledgeItemModel
        .find(filter)
        .populate('creatorId', 'email profile')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.knowledgeItemModel.countDocuments(filter),
    ])

    return {
      items: items.map((item: any) => ({
        id: item._id.toString(),
        title: item.title,
        type: item.type === 'image_asset' ? 'asset' : 'knowledge',
        enterpriseName: item.enterpriseId?.toString() ?? '-',
        submitter: item.creatorId?.email ?? '-',
        status: item.status,
        createdAt: item.createdAt,
      })),
      total,
    }
  }

  async approveReviewItem(admin: any, itemId: string, meta: { ip?: string; userAgent?: string }) {
    const item = await this.knowledgeItemModel.findById(itemId)
    if (!item) throw new NotFoundException('审核项不存在')

    const before = { status: item.status, rejectedReason: item.rejectedReason }
    item.status = 'active'
    item.approvedBy = admin.userId as any
    item.rejectedReason = undefined
    await item.save()

    await this.auditLogService.write({
      actor: admin,
      action: 'APPROVE_REVIEW_ITEM',
      targetType: 'review',
      targetId: item._id.toString(),
      targetName: item.title,
      before,
      after: { status: item.status },
      ...meta,
    })

    return { success: true }
  }

  async rejectReviewItem(
    admin: any,
    itemId: string,
    reason: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const item = await this.knowledgeItemModel.findById(itemId)
    if (!item) throw new NotFoundException('审核项不存在')

    const before = { status: item.status, rejectedReason: item.rejectedReason }
    item.status = 'rejected'
    item.rejectedReason = reason
    await item.save()

    await this.auditLogService.write({
      actor: admin,
      action: 'REJECT_REVIEW_ITEM',
      targetType: 'review',
      targetId: item._id.toString(),
      targetName: item.title,
      before,
      after: { status: item.status, rejectedReason: item.rejectedReason },
      ...meta,
    })

    return { success: true }
  }

  private toManagedUser(user: any) {
    return {
      id: user._id.toString(),
      email: user.email,
      nickname: user.profile?.nickname,
      status: user.status,
      role: user.memberships?.[0]?.role ?? 'member',
      createdAt: user.createdAt,
    }
  }

  private async toManagedEnterprise(enterprise: any) {
    const [members, teams] = await Promise.all([
      this.userModel.countDocuments({ 'memberships.enterpriseId': enterprise._id }),
      this.teamModel.countDocuments({ enterpriseId: enterprise._id }),
    ])

    return {
      id: enterprise._id.toString(),
      name: enterprise.name,
      logo: enterprise.logo,
      status: enterprise.status,
      members,
      teams,
      quotaUsed: 0,
      createdAt: enterprise.createdAt,
    }
  }
}
