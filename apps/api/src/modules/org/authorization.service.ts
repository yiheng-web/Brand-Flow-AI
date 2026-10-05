import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Role, spacePermissions } from '@brand-flow/contracts'
import type { SpacePermissions, SpaceType } from '@brand-flow/contracts'
import { assertObjectId } from '@/common/personal-scope'
import { User, type UserDocument } from './schemas/user.schema'
import { Team, type TeamDocument } from './schemas/team.schema'
import { Enterprise, type EnterpriseDocument } from './schemas/enterprise.schema'

export interface AuthorizedSpace {
  spaceId: string
  spaceType: SpaceType
  enterpriseId?: string
  role: Role
  permissions: SpacePermissions
}

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Team.name) private readonly teamModel: Model<TeamDocument>,
    @InjectModel(Enterprise.name) private readonly enterpriseModel: Model<EnterpriseDocument>,
  ) {}

  async assertCanReadSpace(userId: string, spaceId: string): Promise<AuthorizedSpace> {
    assertObjectId(userId)
    if (spaceId === 'personal') return this.result(spaceId, 'personal', Role.OWNER)
    assertObjectId(spaceId)
    const user = await this.userModel.findById(userId)
    if (!user) throw new ForbiddenException('用户不存在')
    const team = await this.teamModel.findById(spaceId)
    const enterpriseId = team ? team.enterpriseId.toString() : spaceId
    const enterprise = await this.enterpriseModel.findById(enterpriseId)
    if (!enterprise) throw new NotFoundException('空间所属企业不存在')
    const enterpriseMembership = user.memberships.find(
      (item) => !item.teamId && item.enterpriseId.toString() === enterpriseId,
    )
    const teamMembership = team
      ? user.memberships.find(
          (item) =>
            item.enterpriseId.toString() === enterpriseId && item.teamId?.toString() === spaceId,
        )
      : undefined
    // 企业访客不能借团队角色升权；仅企业 OWNER/ADMIN 具有团队管理穿透权限。
    const enterpriseRole = enterpriseMembership?.role
    let role: Role | undefined
    if (team) {
      role =
        enterpriseRole === Role.OWNER || enterpriseRole === Role.ADMIN
          ? enterpriseRole
          : teamMembership?.role
      if (role && enterpriseRole === Role.VIEWER) role = Role.VIEWER
    } else {
      role = enterpriseRole
      // 兼容历史仅有团队 membership 的用户，企业权限按最低权限解释。
      if (!role && user.memberships.some((item) => item.enterpriseId.toString() === enterpriseId)) {
        role = Role.VIEWER
      }
    }
    if (!role) throw new ForbiddenException('您不属于该空间')
    return this.result(spaceId, team ? 'team' : 'enterprise', role, enterpriseId)
  }

  assertCanWriteSpace(userId: string, spaceId: string): Promise<AuthorizedSpace> {
    return this.assertPermission(userId, spaceId, 'write')
  }

  assertCanManageMembers(userId: string, spaceId: string): Promise<AuthorizedSpace> {
    return this.assertPermission(userId, spaceId, 'manageMembers')
  }

  assertCanManageKnowledge(userId: string, spaceId: string): Promise<AuthorizedSpace> {
    return this.assertPermission(userId, spaceId, 'manageKnowledge')
  }

  assertCanManageAssets(userId: string, spaceId: string): Promise<AuthorizedSpace> {
    return this.assertPermission(userId, spaceId, 'manageAssets')
  }

  assertCanManageWorks(userId: string, spaceId: string): Promise<AuthorizedSpace> {
    return this.assertPermission(userId, spaceId, 'manageWorks')
  }

  assertCanAssignTasks(userId: string, spaceId: string): Promise<AuthorizedSpace> {
    return this.assertPermission(userId, spaceId, 'assignTasks')
  }

  assertInvitableRole(role: Role = Role.MEMBER): void {
    if (role === Role.OWNER) throw new ForbiddenException('OWNER 只能通过所有权转移产生')
  }

  assertEnterpriseContext(space: AuthorizedSpace, enterpriseId: string | undefined): void {
    if (!enterpriseId || space.enterpriseId !== enterpriseId) {
      throw new ForbiddenException('目标空间与当前企业不一致')
    }
  }

  assertAssetVisibility(ownerType: string, visibility: string): void {
    const allowed: Record<string, string[]> = {
      user: ['private'],
      team: ['team'],
      enterprise: ['enterprise', 'public'],
    }
    if (!allowed[ownerType]?.includes(visibility))
      throw new BadRequestException('素材归属与可见性不一致')
  }

  private async assertPermission(
    userId: string,
    spaceId: string,
    permission: keyof SpacePermissions,
  ) {
    const space = await this.assertCanReadSpace(userId, spaceId)
    if (!space.permissions[permission]) throw new ForbiddenException('您无权执行此空间操作')
    return space
  }

  private result(
    spaceId: string,
    spaceType: SpaceType,
    role: Role,
    enterpriseId?: string,
  ): AuthorizedSpace {
    return {
      spaceId,
      spaceType,
      enterpriseId,
      role,
      permissions: spacePermissions(spaceType, role),
    }
  }
}
