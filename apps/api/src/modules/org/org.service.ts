import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { OwnerType, Role, Visibility } from '@/common/enums'
import { CreateWorkspaceDto, CreateTeamDto, InviteSpaceMemberDto } from './dto/org.dto'
import { Workspace, WorkspaceDocument } from './schemas/workspace.schema'
import { User, UserDocument } from './schemas/user.schema'
import { Team, TeamDocument } from './schemas/team.schema'
import { Membership, MembershipDocument, MembershipScopeType } from './schemas/membership.schema'
import { Space, SpaceDocument, SpaceType } from './schemas/space.schema'
import { Invitation, InvitationDocument } from './schemas/invitation.schema'
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema'

export interface AccessibleSpaceContext {
  spaceId: string
  spaceType: SpaceType
  workspaceId: string
  ownerType: OwnerType
  ownerId: string
  visibility: Visibility
  role: Role
}

@Injectable()
export class OrgService {
  constructor(
    @InjectModel(Workspace.name) private readonly workspaceModel: Model<WorkspaceDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Team.name) private readonly teamModel: Model<TeamDocument>,
    @InjectModel(Membership.name) private readonly membershipModel: Model<MembershipDocument>,
    @InjectModel(Space.name) private readonly spaceModel: Model<SpaceDocument>,
    @InjectModel(Invitation.name) private readonly invitationModel: Model<InvitationDocument>,
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async createWorkspace(userId: string, createDto: CreateWorkspaceDto) {
    const { name, logo } = createDto

    const exists = await this.workspaceModel.findOne({ name })
    if (exists) {
      throw new BadRequestException('该企业名称已被使用')
    }

    const userObjectId = new Types.ObjectId(userId)
    const Workspace = await this.workspaceModel.create({
      name,
      type: 'organization',
      logo,
      status: 'active',
      ownerUserId: userObjectId,
    })

    await this.membershipModel.create({
      userId: userObjectId,
      workspaceId: Workspace._id,
      scopeType: 'workspace',
      scopeId: Workspace._id,
      role: Role.OWNER,
      status: 'active',
      joinedAt: new Date(),
    })

    await this.spaceModel.create([
      {
        workspaceId: Workspace._id,
        type: 'organization',
        ownerId: Workspace._id,
        name: Workspace.name,
        status: 'active',
      },
      {
        workspaceId: Workspace._id,
        type: 'personal',
        ownerId: userObjectId,
        name: '个人空间',
        status: 'active',
      },
    ])

    await this.writeAuditLog(
      Workspace._id.toString(),
      userId,
      'Workspace.created',
      'workspace',
      Workspace._id,
    )

    return Workspace
  }

  async createPersonalWorkspace(userId: string, displayName?: string) {
    const userObjectId = new Types.ObjectId(userId)
    const name = displayName ? `${displayName} 的个人工作区-${userId}` : `个人工作区-${userId}`

    const existing = await this.workspaceModel.findOne({
      type: 'personal',
      ownerUserId: userObjectId,
    })
    if (existing) {
      await this.ensurePersonalSpace(userId, existing._id.toString())
      return existing
    }

    const workspace = await this.workspaceModel.create({
      name,
      type: 'personal',
      status: 'active',
      ownerUserId: userObjectId,
    })

    await this.membershipModel.create({
      userId: userObjectId,
      workspaceId: workspace._id,
      scopeType: 'workspace',
      scopeId: workspace._id,
      role: Role.OWNER,
      status: 'active',
      joinedAt: new Date(),
    })

    await this.spaceModel.create({
      workspaceId: workspace._id,
      type: 'personal',
      ownerId: userObjectId,
      name: '个人空间',
      status: 'active',
    })

    await this.writeAuditLog(
      workspace._id.toString(),
      userId,
      'workspace.personal.created',
      'workspace',
      workspace._id,
    )

    return workspace
  }

  async getMyWorkspaces(userId: string) {
    const memberships = await this.membershipModel
      .find({
        userId: new Types.ObjectId(userId),
        scopeType: 'workspace',
        status: 'active',
      })
      .populate({ path: 'workspaceId', model: Workspace.name })
      .sort({ createdAt: 1 })

    return memberships.map((membership) => {
      const Workspace = membership.workspaceId as unknown as WorkspaceDocument
      return {
        role: membership.role,
        workspaceId: Workspace._id,
        name: Workspace.name,
        logo: Workspace.logo,
        status: Workspace.status,
      }
    })
  }

  async switchWorkspace(userId: string, workspaceId: string) {
    const membership = await this.findActiveWorkspaceMembership(userId, workspaceId)

    await this.ensurePersonalSpace(userId, workspaceId)

    return {
      success: true,
      activeWorkspaceId: workspaceId,
      role: membership.role,
    }
  }

  async createTeam(userId: string, workspaceId: string, createDto: CreateTeamDto) {
    const { name, description } = createDto
    await this.assertWorkspaceManager(userId, workspaceId)

    const exists = await this.teamModel.findOne({ workspaceId, name })
    if (exists) {
      throw new BadRequestException('该企业下已存在同名团队')
    }

    const team = await this.teamModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name,
      description,
      status: 'active',
      createdBy: new Types.ObjectId(userId),
    })

    await this.membershipModel.create({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      scopeType: 'team',
      scopeId: team._id,
      role: Role.OWNER,
      status: 'active',
      joinedAt: new Date(),
    })

    await this.spaceModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      type: 'team',
      ownerId: team._id,
      name: team.name,
      status: 'active',
    })

    await this.writeAuditLog(workspaceId, userId, 'team.created', 'team', team._id)

    return team
  }

  async getTeams(workspaceId: string) {
    this.assertObjectId(workspaceId, '企业 ID 不正确')
    return this.teamModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        status: { $ne: 'archived' },
      })
      .sort({ createdAt: -1 })
  }

  async getMySpaces(userId: string, workspaceId: string) {
    await this.findActiveWorkspaceMembership(userId, workspaceId)

    const workspaceMemberships = await this.membershipModel
      .find({
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId),
        status: 'active',
      })
      .sort({ createdAt: 1 })

    const spaces: Array<{
      id: string
      spaceId: string
      type: SpaceType
      name: string
      role: Role
      workspaceId: string
    }> = []
    const seen = new Set<string>()

    await this.ensurePersonalSpace(userId, workspaceId)

    for (const membership of workspaceMemberships) {
      const query =
        membership.scopeType === 'workspace'
          ? {
              workspaceId: membership.workspaceId,
              $or: [
                { type: 'organization', ownerId: membership.workspaceId },
                { type: 'personal', ownerId: new Types.ObjectId(userId) },
              ],
            }
          : {
              workspaceId: membership.workspaceId,
              type: 'team',
              ownerId: membership.scopeId,
            }

      const foundSpaces = await this.spaceModel.find({ ...query, status: 'active' })
      for (const space of foundSpaces) {
        const id = space._id.toString()
        if (seen.has(id)) {
          continue
        }
        seen.add(id)
        spaces.push({
          id,
          spaceId: id,
          type: space.type,
          name: space.name,
          role: membership.role,
          workspaceId: space.workspaceId.toString(),
        })
      }
    }

    return spaces
  }

  async getSpaceMembers(userId: string, spaceId: string) {
    const { space } = await this.resolveSpaceWithMembership(userId, spaceId)

    if (space.type === 'personal') {
      const user = await this.userModel.findById(space.ownerId)
      if (!user) {
        throw new NotFoundException('用户不存在')
      }

      return [
        {
          userId: user._id,
          email: user.email,
          nickname: user.profile?.nickname,
          avatar: user.profile?.avatar,
          role: Role.OWNER,
        },
      ]
    }

    const memberships = await this.membershipModel
      .find({
        workspaceId: space.workspaceId,
        scopeType: this.toMembershipScopeType(space.type),
        scopeId: space.ownerId,
        status: 'active',
      })
      .populate({ path: 'userId', model: User.name })
      .sort({ createdAt: 1 })

    return memberships.map((membership) => {
      const user = membership.userId as unknown as UserDocument
      return {
        userId: user._id,
        email: user.email,
        nickname: user.profile?.nickname,
        avatar: user.profile?.avatar,
        role: membership.role,
      }
    })
  }

  async resolveAccessibleSpace(
    userId: string,
    spaceId: string,
    activeWorkspaceId?: string,
  ): Promise<AccessibleSpaceContext> {
    if (!spaceId) {
      throw new BadRequestException('空间 ID 不能为空')
    }

    const { space, membership } = await this.resolveSpaceWithMembership(
      userId,
      spaceId,
      activeWorkspaceId,
    )

    if (activeWorkspaceId && space.workspaceId.toString() !== activeWorkspaceId) {
      throw new BadRequestException('空间不属于当前企业')
    }

    return {
      spaceId: space._id.toString(),
      spaceType: space.type,
      workspaceId: space.workspaceId.toString(),
      ownerType: this.toOwnerType(space.type),
      ownerId: space.ownerId.toString(),
      visibility: this.toVisibility(space.type),
      role: membership.role,
    }
  }

  async inviteSpaceMember(userId: string, spaceId: string, inviteDto: InviteSpaceMemberDto) {
    const { space, membership } = await this.resolveSpaceWithMembership(userId, spaceId)
    if (space.type === 'personal') {
      throw new BadRequestException('个人空间不支持邀请成员')
    }
    if (membership.role !== Role.OWNER && membership.role !== Role.ADMIN) {
      throw new BadRequestException('您在该空间中不是管理员，无权邀请成员')
    }

    const targetUser = await this.userModel.findOne({ email: inviteDto.email })
    if (!targetUser) {
      throw new NotFoundException('被邀请用户不存在，请先注册账号')
    }

    const scopeType = this.toMembershipScopeType(space.type)
    const existing = await this.membershipModel.findOne({
      userId: targetUser._id,
      scopeType,
      scopeId: space.ownerId,
      status: 'active',
    })
    if (existing) {
      throw new BadRequestException('该用户已经在空间中')
    }

    await this.membershipModel.findOneAndUpdate(
      {
        userId: targetUser._id,
        scopeType,
        scopeId: space.ownerId,
      },
      {
        $set: {
          userId: targetUser._id,
          workspaceId: space.workspaceId,
          scopeType,
          scopeId: space.ownerId,
          role: inviteDto.role ?? Role.MEMBER,
          status: 'active',
          invitedBy: new Types.ObjectId(userId),
          joinedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    )

    await this.ensurePersonalSpace(targetUser._id.toString(), space.workspaceId.toString())
    await this.writeAuditLog(
      space.workspaceId.toString(),
      userId,
      'member.invited',
      'space',
      space._id,
      { email: inviteDto.email, role: inviteDto.role ?? Role.MEMBER },
    )

    return {
      success: true,
      spaceId,
      userId: targetUser._id,
      email: targetUser.email,
      role: inviteDto.role ?? Role.MEMBER,
    }
  }

  private async resolveSpaceWithMembership(
    userId: string,
    spaceId: string,
    activeWorkspaceId?: string,
  ) {
    const space = await this.resolveSpace(spaceId)
    if (activeWorkspaceId && space.workspaceId.toString() !== activeWorkspaceId) {
      throw new BadRequestException('空间不属于当前企业')
    }
    const membership = await this.findSpaceMembership(userId, space)
    if (!membership) {
      throw new BadRequestException('您不属于该空间')
    }

    return { space, membership }
  }

  private async resolveSpace(spaceId: string) {
    this.assertObjectId(spaceId, '空间 ID 不正确')

    const directSpace = await this.spaceModel.findById(spaceId)
    if (directSpace) {
      return directSpace
    }

    throw new NotFoundException('空间不存在')
  }

  private async findSpaceMembership(userId: string, space: SpaceDocument) {
    if (space.type === 'personal') {
      if (space.ownerId.toString() !== userId) {
        return null
      }

      const membership = await this.membershipModel.findOne({
        userId: new Types.ObjectId(userId),
        workspaceId: space.workspaceId,
        scopeType: 'workspace',
        status: 'active',
      })
      return membership ? { role: Role.OWNER } : null
    }

    return this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      workspaceId: space.workspaceId,
      scopeType: this.toMembershipScopeType(space.type),
      scopeId: space.ownerId,
      status: 'active',
    })
  }

  private async findActiveWorkspaceMembership(userId: string, workspaceId: string) {
    this.assertObjectId(workspaceId, '企业 ID 不正确')
    const membership = await this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      scopeType: 'workspace',
      scopeId: new Types.ObjectId(workspaceId),
      status: 'active',
    })

    if (!membership) {
      throw new BadRequestException('您不属于该企业，无法切换')
    }

    return membership
  }

  private async assertWorkspaceManager(userId: string, workspaceId: string) {
    const membership = await this.findActiveWorkspaceMembership(userId, workspaceId)
    if (membership.role !== Role.OWNER && membership.role !== Role.ADMIN) {
      throw new BadRequestException('您在该企业中不是管理员，无权操作')
    }
    return membership
  }

  private async ensureWorkspaceSpace(workspaceId: string) {
    const Workspace = await this.workspaceModel.findById(workspaceId)
    if (!Workspace) {
      throw new NotFoundException('企业不存在')
    }

    return this.spaceModel.findOneAndUpdate(
      {
        workspaceId: Workspace._id,
        type: 'organization',
        ownerId: Workspace._id,
      },
      {
        $setOnInsert: {
          workspaceId: Workspace._id,
          type: 'organization',
          ownerId: Workspace._id,
          name: Workspace.name,
          status: 'active',
        },
      },
      { upsert: true, new: true },
    )
  }

  private async ensureTeamSpace(team: TeamDocument) {
    return this.spaceModel.findOneAndUpdate(
      {
        workspaceId: team.workspaceId,
        type: 'team',
        ownerId: team._id,
      },
      {
        $setOnInsert: {
          workspaceId: team.workspaceId,
          type: 'team',
          ownerId: team._id,
          name: team.name,
          status: 'active',
        },
      },
      { upsert: true, new: true },
    )
  }

  private async ensurePersonalSpace(userId: string, workspaceId: string) {
    await this.findActiveWorkspaceMembership(userId, workspaceId)

    return this.spaceModel.findOneAndUpdate(
      {
        workspaceId: new Types.ObjectId(workspaceId),
        type: 'personal',
        ownerId: new Types.ObjectId(userId),
      },
      {
        $setOnInsert: {
          workspaceId: new Types.ObjectId(workspaceId),
          type: 'personal',
          ownerId: new Types.ObjectId(userId),
          name: '个人空间',
          status: 'active',
        },
      },
      { upsert: true, new: true },
    )
  }

  private toMembershipScopeType(spaceType: SpaceType): MembershipScopeType {
    if (spaceType === 'team') {
      return 'team'
    }
    return 'workspace'
  }

  private toOwnerType(spaceType: SpaceType) {
    if (spaceType === 'personal') {
      return OwnerType.USER
    }
    if (spaceType === 'team') {
      return OwnerType.TEAM
    }
    return OwnerType.WORKSPACE
  }

  private toVisibility(spaceType: SpaceType) {
    if (spaceType === 'personal') {
      return Visibility.PRIVATE
    }
    if (spaceType === 'team') {
      return Visibility.TEAM
    }
    return Visibility.WORKSPACE
  }

  private assertObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message)
    }
  }

  private async writeAuditLog(
    workspaceId: string,
    actorUserId: string,
    action: string,
    targetType: string,
    targetId?: Types.ObjectId,
    metadata?: Record<string, unknown>,
  ) {
    await this.auditLogModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      actorUserId: new Types.ObjectId(actorUserId),
      action,
      targetType,
      targetId,
      metadata,
    })
  }
}
