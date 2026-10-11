import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ConfigService } from '@nestjs/config'
import { Model, Types } from 'mongoose'
import type { ClientSession } from 'mongoose'
import { Role } from '@brand-flow/contracts'
import { AuthorizationService } from './authorization.service'
import { ActivityService } from './activity.service'
import type { AuthorizedSpace } from './authorization.service'
import { Enterprise, type EnterpriseDocument } from './schemas/enterprise.schema'
import { User, type UserDocument } from './schemas/user.schema'
import { assertObjectId } from '@/common/personal-scope'

@Injectable()
export class MembershipService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Enterprise.name) private readonly enterpriseModel: Model<EnterpriseDocument>,
    private readonly authorization: AuthorizationService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
  ) {}

  async transaction<T>(
    enterpriseId: string,
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    assertObjectId(enterpriseId)
    return this.atomic(async (session) => {
      // 同一企业的成员、邀请及状态变更争用同一文档，事务冲突重试后重新授权。
      const enterprise = await this.enterpriseModel.findByIdAndUpdate(
        enterpriseId,
        { $inc: { membershipVersion: 1 } },
        { new: true, session },
      )
      if (!enterprise) throw new NotFoundException('企业不存在')
      return operation(session)
    })
  }

  async atomic<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    try {
      return await this.userModel.db.transaction(operation)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && Reflect.get(error, 'code') === 20) {
        throw new ServiceUnavailableException('组织成员操作需要 MongoDB 副本集，请检查部署配置')
      }
      throw error
    }
  }

  findMembership(user: UserDocument, space: AuthorizedSpace) {
    return user.memberships.find(
      (item) =>
        item.enterpriseId.toString() === space.enterpriseId &&
        (space.spaceType === 'team' ? item.teamId?.toString() === space.spaceId : !item.teamId),
    )
  }

  async changeRole(
    userId: string,
    spaceId: string,
    targetId: string,
    role: Role,
  ): Promise<{ success: true }> {
    assertObjectId(targetId)
    const initial = await this.authorization.assertCanManageMembers(userId, spaceId)
    return this.transaction(initial.enterpriseId!, async (session) => {
      const space = await this.authorization.assertCanManageMembers(userId, spaceId, session)
      const target = await this.userModel.findOne(
        { _id: targetId, 'memberships.enterpriseId': space.enterpriseId },
        null,
        { session },
      )
      if (!target) throw new NotFoundException('成员不存在')
      const membership = this.findMembership(target, space)
      if (!membership) throw new NotFoundException('成员不属于该空间')
      this.authorization.assertCanChangeMember(space, membership.role, role)
      membership.role = role
      await target.save({ session })
      await this.activity.record(
        userId,
        space,
        'member.role_changed',
        'user',
        targetId,
        { role },
        session,
        [targetId],
      )
      return { success: true }
    })
  }

  async remove(
    userId: string,
    spaceId: string,
    targetId: string,
    leaving = false,
  ): Promise<{ success: true }> {
    assertObjectId(targetId)
    const initial = leaving
      ? await this.authorization.assertCanReadOrganization(userId, spaceId)
      : await this.authorization.assertCanManageMembers(userId, spaceId)
    if (initial.spaceType === 'personal') throw new BadRequestException('个人空间没有成员退出操作')
    return this.transaction(initial.enterpriseId!, async (session) => {
      const space = leaving
        ? await this.authorization.assertCanReadOrganization(userId, spaceId, session)
        : await this.authorization.assertCanManageMembers(userId, spaceId, session)
      if (leaving && userId !== targetId) throw new ForbiddenException('只能退出本人的成员关系')
      const target = await this.userModel.findOne(
        { _id: targetId, 'memberships.enterpriseId': space.enterpriseId },
        null,
        { session },
      )
      if (!target) throw new NotFoundException('成员不存在')
      const membership = this.findMembership(target, space)
      if (!membership) throw new NotFoundException('成员不属于该空间')
      if (leaving) {
        if (membership.role === Role.OWNER) throw new ForbiddenException('OWNER 必须先转移所有权')
      } else this.authorization.assertCanChangeMember(space, membership.role)
      target.memberships = target.memberships.filter((item) =>
        space.spaceType === 'enterprise'
          ? item.enterpriseId.toString() !== space.enterpriseId
          : !(
              item.enterpriseId.toString() === space.enterpriseId &&
              item.teamId?.toString() === spaceId
            ),
      )
      if (
        space.spaceType === 'enterprise' &&
        target.currentEnterpriseId?.toString() === space.enterpriseId
      ) {
        target.set('currentEnterpriseId', undefined)
      }
      await target.save({ session })
      await this.activity.record(
        userId,
        space,
        leaving ? 'member.left' : 'member.removed',
        'user',
        targetId,
        {},
        session,
        [targetId],
      )
      return { success: true }
    })
  }

  async transferOwner(
    userId: string,
    enterpriseId: string,
    targetId: string,
  ): Promise<{ success: true }> {
    assertObjectId(targetId)
    if (userId === targetId) throw new BadRequestException('不能转移给自己')
    await this.authorization.assertCanTransferOwnership(userId, enterpriseId)
    return this.transaction(enterpriseId, async (session) => {
      const space = await this.authorization.assertCanTransferOwnership(
        userId,
        enterpriseId,
        session,
      )
      const actor = await this.userModel.findById(userId, null, { session })
      const target = await this.userModel.findOne(
        { _id: targetId, 'memberships.enterpriseId': enterpriseId, status: 'active' },
        null,
        { session },
      )
      const previous = actor && this.findMembership(actor, space)
      const next = target && this.findMembership(target, space)
      if (!actor || !previous || previous.role !== Role.OWNER)
        throw new ForbiddenException('仅 OWNER 可转移所有权')
      if (!target || !next) throw new BadRequestException('目标必须是企业成员')
      const limit = Number(this.config.get('ORG_MAX_OWNED_ENTERPRISES', 5))
      if (!Number.isInteger(limit) || limit < 1)
        throw new BadRequestException('企业创建上限配置无效')
      if (
        target.memberships.filter((item) => !item.teamId && item.role === Role.OWNER).length >=
        limit
      )
        throw new BadRequestException('目标成员已达到企业拥有数量上限')
      // 转移与原 OWNER 降级在同一事务内提交，失败不会留下无 OWNER 的企业。
      previous.role = Role.ADMIN
      next.role = Role.OWNER
      await actor.save({ session })
      await target.save({ session })
      await this.activity.record(
        userId,
        space,
        'enterprise.owner_transferred',
        'user',
        targetId,
        { role: Role.OWNER },
        session,
        [userId, targetId],
      )
      return { success: true }
    })
  }

  async joinInvitation(
    user: UserDocument,
    space: AuthorizedSpace,
    role: Role,
    session: ClientSession,
  ): Promise<void> {
    if (space.spaceType === 'personal') throw new BadRequestException('不能邀请到个人空间')
    this.authorization.assertInvitableRole(role)
    const enterpriseId = new Types.ObjectId(space.enterpriseId)
    if (
      space.spaceType === 'team' &&
      !user.memberships.some(
        (item) => item.enterpriseId.toString() === space.enterpriseId && !item.teamId,
      )
    ) {
      user.memberships.push({
        enterpriseId,
        role: role === Role.VIEWER ? Role.VIEWER : Role.MEMBER,
      })
    }
    // 重复接受或已经加入不改变既有角色，防止旧邀请覆盖后来调整的权限。
    if (!this.findMembership(user, space)) {
      user.memberships.push({
        enterpriseId,
        ...(space.spaceType === 'team' ? { teamId: new Types.ObjectId(space.spaceId) } : {}),
        role,
      })
    }
    await user.save({ session })
  }
}
