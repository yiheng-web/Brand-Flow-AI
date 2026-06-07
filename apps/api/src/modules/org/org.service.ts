import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Enterprise, EnterpriseDocument } from './schemas/enterprise.schema'
import { User, UserDocument } from './schemas/user.schema'
import { Team, TeamDocument } from './schemas/team.schema'
import { EnterpriseRole, Role, TeamRole } from '@/common/enums'
import {
  CreateEnterpriseDto,
  CreateTeamDto,
  InviteSpaceMemberDto,
  UpdateEnterpriseBrandRulesDto,
  UpdateEnterprisePoliciesDto,
  UpdateSpaceMemberRoleDto,
} from './dto/org.dto'
import {
  EnterpriseMembership,
  EnterpriseMembershipDocument,
} from './schemas/enterprise-membership.schema'
import { TeamMembership, TeamMembershipDocument } from './schemas/team-membership.schema'

export type SpaceType = 'personal' | 'team' | 'enterprise'

export interface SpaceContext {
  spaceId: string
  spaceType: SpaceType
  ownerUserId?: string
  teamId?: string
  enterpriseId?: string
  role: Role | EnterpriseRole | TeamRole
  permissions: string[]
  policies?: EnterpriseDocument['policies']
}

@Injectable()
export class OrgService {
  constructor(
    @InjectModel(Enterprise.name) private enterpriseModel: Model<EnterpriseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(EnterpriseMembership.name)
    private enterpriseMembershipModel: Model<EnterpriseMembershipDocument>,
    @InjectModel(TeamMembership.name)
    private teamMembershipModel: Model<TeamMembershipDocument>,
  ) {}

  async createEnterprise(userId: string, createDto: CreateEnterpriseDto) {
    const { name, logo } = createDto

    const exists = await this.enterpriseModel.findOne({ name })
    if (exists) {
      throw new BadRequestException('该企业名称已被使用')
    }

    // TODO: 后续若加入企业注册审核流，此处 status 可改为 'pending'
    const enterprise = await this.enterpriseModel.create({
      name,
      logo,
      status: 'active',
    })

    await this.userModel.findByIdAndUpdate(userId, {
      $push: {
        memberships: {
          enterpriseId: enterprise._id,
          role: Role.OWNER,
        },
      },
      currentEnterpriseId: enterprise._id,
    })

    await this.enterpriseMembershipModel.updateOne(
      { enterpriseId: enterprise._id, userId },
      {
        enterpriseId: enterprise._id,
        userId,
        role: EnterpriseRole.ENTERPRISE_ADMIN,
        status: 'active',
        joinedAt: new Date(),
      },
      { upsert: true },
    )

    return enterprise
  }

  async getMyEnterprises(userId: string) {
    const user = await this.userModel.findById(userId).populate({
      path: 'memberships.enterpriseId',
      model: Enterprise.name,
    })

    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    return user.memberships.map((m: any) => ({
      role: m.role,
      enterpriseId: m.enterpriseId._id,
      name: m.enterpriseId.name,
      logo: m.enterpriseId.logo,
      status: m.enterpriseId.status,
    }))
  }

  async switchEnterprise(userId: string, enterpriseId: string) {
    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const isMember = user.memberships.some((m) => m.enterpriseId.toString() === enterpriseId)

    if (!isMember) {
      throw new BadRequestException('您不属于该企业，无法切换')
    }

    user.currentEnterpriseId = enterpriseId as any
    await user.save()

    return { success: true, currentEnterpriseId: enterpriseId }
  }

  async createTeam(userId: string, enterpriseId: string, createDto: CreateTeamDto) {
    const { name, description } = createDto

    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业再创建团队')
    }

    const user = await this.userModel.findById(userId)
    const membership = user?.memberships.find(
      (m) => m.enterpriseId.toString() === enterpriseId && !m.teamId,
    )

    if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
      throw new BadRequestException('您在该企业中不是管理员，无权创建团队')
    }

    const exists = await this.teamModel.findOne({ enterpriseId, name })
    if (exists) {
      throw new BadRequestException('该企业下已存在同名团队')
    }

    const team = await this.teamModel.create({
      enterpriseId,
      name,
      description,
    })

    await this.userModel.findByIdAndUpdate(userId, {
      $push: {
        memberships: {
          enterpriseId: enterpriseId,
          teamId: team._id,
          role: membership.role,
        },
      },
    })

    await this.teamMembershipModel.updateOne(
      { teamId: team._id, userId },
      {
        enterpriseId,
        teamId: team._id,
        userId,
        role: TeamRole.TEAM_ADMIN,
        status: 'active',
        joinedAt: new Date(),
      },
      { upsert: true },
    )

    return team
  }

  async getTeams(enterpriseId: string) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    return this.teamModel.find({ enterpriseId })
  }

  async getMySpaces(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate({ path: 'memberships.enterpriseId', model: Enterprise.name })
      .populate({ path: 'memberships.teamId', model: Team.name })

    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const spaces = [
      {
        id: 'personal',
        spaceId: 'personal',
        type: 'personal',
        name: '个人空间',
        role: Role.OWNER,
      },
    ]

    const seen = new Set<string>(['personal'])

    for (const membership of user.memberships as any[]) {
      const enterprise = membership.enterpriseId
      const team = membership.teamId

      if (enterprise?._id) {
        const enterpriseSpaceId = enterprise._id.toString()
        if (!seen.has(enterpriseSpaceId)) {
          seen.add(enterpriseSpaceId)
          spaces.push({
            id: enterpriseSpaceId,
            spaceId: enterpriseSpaceId,
            type: 'enterprise',
            name: enterprise.name,
            role: membership.role,
          })
        }
      }

      if (team?._id) {
        const teamSpaceId = team._id.toString()
        if (!seen.has(teamSpaceId)) {
          seen.add(teamSpaceId)
          spaces.push({
            id: teamSpaceId,
            spaceId: teamSpaceId,
            type: 'team',
            name: team.name,
            role: membership.role,
          })
        }
      }
    }

    return spaces
  }

  async getSpaceMembers(userId: string, spaceId: string) {
    if (spaceId === 'personal') {
      const user = await this.userModel.findById(userId)
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

    const space = await this.resolveSpace(spaceId)
    await this.assertSpaceMember(userId, space)

    const users =
      space.type === 'team'
        ? await this.userModel.find({ 'memberships.teamId': space.team._id })
        : await this.userModel.find({ 'memberships.enterpriseId': space.enterprise._id })

    return Promise.all(
      users.map(async (user) => {
        const membership = await this.findSpaceMembership(user as UserDocument, space)

        return {
          userId: user._id,
          email: user.email,
          nickname: user.profile?.nickname,
          avatar: user.profile?.avatar,
          role: membership?.role ?? Role.MEMBER,
        }
      }),
    )
  }

  async inviteSpaceMember(userId: string, spaceId: string, inviteDto: InviteSpaceMemberDto) {
    if (spaceId === 'personal') {
      throw new BadRequestException('个人空间不支持邀请成员')
    }

    const space = await this.resolveSpace(spaceId)
    await this.assertSpaceManager(userId, space)

    const targetUser = await this.userModel.findOne({ email: inviteDto.email })
    if (!targetUser) {
      throw new NotFoundException('被邀请用户不存在，请先注册账号')
    }

    const exists = await this.findSpaceMembership(targetUser, space)
    if (exists) {
      throw new BadRequestException('该用户已经在空间中')
    }

    targetUser.memberships.push({
      enterpriseId: space.enterprise._id as Types.ObjectId,
      teamId: space.type === 'team' ? (space.team._id as Types.ObjectId) : undefined,
      role: inviteDto.role ?? Role.MEMBER,
    } as any)

    await targetUser.save()

    if (space.type === 'team') {
      await this.teamMembershipModel.updateOne(
        { teamId: space.team._id, userId: targetUser._id },
        {
          enterpriseId: space.enterprise._id,
          teamId: space.team._id,
          userId: targetUser._id,
          role: this.mapLegacyRoleToTeamRole(inviteDto.role ?? Role.MEMBER),
          status: 'active',
          invitedBy: userId,
          joinedAt: new Date(),
        },
        { upsert: true },
      )
    } else {
      await this.enterpriseMembershipModel.updateOne(
        { enterpriseId: space.enterprise._id, userId: targetUser._id },
        {
          enterpriseId: space.enterprise._id,
          userId: targetUser._id,
          role: this.mapLegacyRoleToEnterpriseRole(inviteDto.role ?? Role.MEMBER),
          status: 'active',
          invitedBy: userId,
          joinedAt: new Date(),
        },
        { upsert: true },
      )
    }

    return {
      success: true,
      spaceId,
      userId: targetUser._id,
      email: targetUser.email,
      role: inviteDto.role ?? Role.MEMBER,
    }
  }

  async resolveSpaceContext(userId: string, spaceId: string): Promise<SpaceContext> {
    if (spaceId === 'personal') {
      const user = await this.userModel.findById(userId)
      if (!user) {
        throw new NotFoundException('用户不存在')
      }

      return {
        spaceId: 'personal',
        spaceType: 'personal',
        ownerUserId: userId,
        role: Role.OWNER,
        permissions: this.permissionsForRole('personal', Role.OWNER),
      }
    }

    const space = await this.resolveSpace(spaceId)
    const user = await this.userModel.findById(userId)
    const membership = user ? await this.findSpaceMembership(user, space) : undefined

    if (!membership) {
      throw new BadRequestException('您不属于该空间')
    }

    if (space.type === 'team') {
      return {
        spaceId,
        spaceType: 'team',
        teamId: space.team._id.toString(),
        enterpriseId: space.enterprise._id.toString(),
        role: membership.role,
        permissions: this.permissionsForRole('team', membership.role),
        policies: space.enterprise.policies,
      }
    }

    return {
      spaceId,
      spaceType: 'enterprise',
      enterpriseId: space.enterprise._id.toString(),
      role: membership.role,
      permissions: this.permissionsForRole('enterprise', membership.role),
      policies: space.enterprise.policies,
    }
  }

  async updateSpaceMemberRole(
    operatorUserId: string,
    spaceId: string,
    targetUserId: string,
    dto: UpdateSpaceMemberRoleDto,
  ) {
    if (spaceId === 'personal') {
      throw new BadRequestException('个人空间不支持成员角色管理')
    }

    const space = await this.resolveSpace(spaceId)
    await this.assertSpaceManager(operatorUserId, space)

    const targetUser = await this.userModel.findById(targetUserId)
    if (!targetUser) {
      throw new NotFoundException('成员不存在')
    }

    if (space.type === 'team') {
      if (!Object.values(TeamRole).includes(dto.role as TeamRole)) {
        throw new BadRequestException('团队空间角色不合法')
      }

      const result = await this.teamMembershipModel.findOneAndUpdate(
        { teamId: space.team._id, userId: targetUser._id, status: 'active' },
        { role: dto.role },
        { new: true },
      )
      if (!result) {
        throw new NotFoundException('团队成员不存在')
      }

      await this.syncLegacyMembershipRole(
        targetUser,
        space.enterprise._id,
        space.team._id,
        this.mapTeamRoleToLegacyRole(dto.role as TeamRole),
      )

      return { success: true, userId: targetUserId, role: result.role }
    }

    if (!Object.values(EnterpriseRole).includes(dto.role as EnterpriseRole)) {
      throw new BadRequestException('企业空间角色不合法')
    }

    const result = await this.enterpriseMembershipModel.findOneAndUpdate(
      { enterpriseId: space.enterprise._id, userId: targetUser._id, status: 'active' },
      { role: dto.role },
      { new: true },
    )
    if (!result) {
      throw new NotFoundException('企业成员不存在')
    }

    await this.syncLegacyMembershipRole(
      targetUser,
      space.enterprise._id,
      undefined,
      this.mapEnterpriseRoleToLegacyRole(dto.role as EnterpriseRole),
    )

    return { success: true, userId: targetUserId, role: result.role }
  }

  async removeSpaceMember(operatorUserId: string, spaceId: string, targetUserId: string) {
    if (spaceId === 'personal') {
      throw new BadRequestException('个人空间不支持移除成员')
    }

    if (operatorUserId === targetUserId) {
      throw new BadRequestException('不能移除自己')
    }

    const space = await this.resolveSpace(spaceId)
    await this.assertSpaceManager(operatorUserId, space)

    const targetUser = await this.userModel.findById(targetUserId)
    if (!targetUser) {
      throw new NotFoundException('成员不存在')
    }

    if (space.type === 'team') {
      const result = await this.teamMembershipModel.findOneAndUpdate(
        { teamId: space.team._id, userId: targetUser._id, status: 'active' },
        { status: 'disabled' },
        { new: true },
      )
      if (!result) {
        throw new NotFoundException('团队成员不存在')
      }

      targetUser.memberships = targetUser.memberships.filter(
        (membership) => membership.teamId?.toString() !== space.team._id.toString(),
      ) as any
      await targetUser.save()

      return { success: true }
    }

    const result = await this.enterpriseMembershipModel.findOneAndUpdate(
      { enterpriseId: space.enterprise._id, userId: targetUser._id, status: 'active' },
      { status: 'disabled' },
      { new: true },
    )
    if (!result) {
      throw new NotFoundException('企业成员不存在')
    }

    targetUser.memberships = targetUser.memberships.filter(
      (membership) => membership.enterpriseId.toString() !== space.enterprise._id.toString(),
    ) as any
    if (targetUser.currentEnterpriseId?.toString() === space.enterprise._id.toString()) {
      targetUser.currentEnterpriseId = undefined as any
    }
    await targetUser.save()

    await this.teamMembershipModel.updateMany(
      { enterpriseId: space.enterprise._id, userId: targetUser._id },
      { status: 'disabled' },
    )

    return { success: true }
  }

  async getSpaceContext(userId: string, spaceId: string) {
    return this.resolveSpaceContext(userId, spaceId)
  }

  async getEnterpriseBrandRules(userId: string, enterpriseId: string) {
    await this.resolveSpaceContext(userId, enterpriseId)
    const enterprise = await this.enterpriseModel.findById(enterpriseId)
    if (!enterprise) throw new NotFoundException('企业不存在')
    return enterprise.brandRules
  }

  async updateEnterpriseBrandRules(
    userId: string,
    enterpriseId: string,
    dto: UpdateEnterpriseBrandRulesDto,
  ) {
    const space = await this.resolveSpaceContext(userId, enterpriseId)
    if (
      !space.permissions.includes('manage_enterprise_brand_rules') &&
      !space.permissions.includes('*')
    ) {
      throw new BadRequestException('您无权配置企业品牌规则')
    }

    const enterprise = await this.enterpriseModel.findByIdAndUpdate(
      enterpriseId,
      {
        $set: {
          brandRules: {
            ...(await this.enterpriseModel.findById(enterpriseId))?.brandRules,
            ...dto,
          },
        },
      },
      { new: true },
    )
    if (!enterprise) throw new NotFoundException('企业不存在')
    return enterprise.brandRules
  }

  async getEnterprisePolicies(userId: string, enterpriseId: string) {
    await this.resolveSpaceContext(userId, enterpriseId)
    const enterprise = await this.enterpriseModel.findById(enterpriseId)
    if (!enterprise) throw new NotFoundException('企业不存在')
    return enterprise.policies
  }

  async updateEnterprisePolicies(
    userId: string,
    enterpriseId: string,
    dto: UpdateEnterprisePoliciesDto,
  ) {
    const space = await this.resolveSpaceContext(userId, enterpriseId)
    if (
      !space.permissions.includes('manage_enterprise_policy') &&
      !space.permissions.includes('*')
    ) {
      throw new BadRequestException('您无权配置企业策略')
    }

    const enterprise = await this.enterpriseModel.findByIdAndUpdate(
      enterpriseId,
      {
        $set: {
          policies: { ...(await this.enterpriseModel.findById(enterpriseId))?.policies, ...dto },
        },
      },
      { new: true },
    )
    if (!enterprise) throw new NotFoundException('企业不存在')
    return enterprise.policies
  }

  private async resolveSpace(spaceId: string) {
    if (!Types.ObjectId.isValid(spaceId)) {
      throw new NotFoundException('空间不存在')
    }

    const team = await this.teamModel.findById(spaceId)
    if (team) {
      const enterprise = await this.enterpriseModel.findById(team.enterpriseId)
      if (!enterprise) {
        throw new NotFoundException('团队所属企业不存在')
      }

      return { type: 'team' as const, team, enterprise }
    }

    const enterprise = await this.enterpriseModel.findById(spaceId)
    if (!enterprise) {
      throw new NotFoundException('空间不存在')
    }

    return { type: 'enterprise' as const, enterprise }
  }

  private async findSpaceMembership(
    user: UserDocument,
    space:
      | { type: 'team'; team: TeamDocument; enterprise: EnterpriseDocument }
      | { type: 'enterprise'; enterprise: EnterpriseDocument },
  ) {
    if (space.type === 'team') {
      const teamMembership = await this.teamMembershipModel.findOne({
        teamId: space.team._id,
        userId: user._id,
        status: 'active',
      })
      if (teamMembership) return teamMembership

      const legacy = user.memberships.find(
        (m) =>
          m.teamId?.toString() === space.team._id.toString() ||
          (!m.teamId && m.enterpriseId.toString() === space.enterprise._id.toString()),
      )
      return legacy ? { role: this.mapLegacyRoleToTeamRole(legacy.role) } : undefined
    }

    const enterpriseMembership = await this.enterpriseMembershipModel.findOne({
      enterpriseId: space.enterprise._id,
      userId: user._id,
      status: 'active',
    })
    if (enterpriseMembership) return enterpriseMembership

    const legacy = user.memberships.find(
      (m) => m.enterpriseId.toString() === space.enterprise._id.toString(),
    )
    return legacy ? { role: this.mapLegacyRoleToEnterpriseRole(legacy.role) } : undefined
  }

  private async assertSpaceMember(
    userId: string,
    space:
      | { type: 'team'; team: TeamDocument; enterprise: EnterpriseDocument }
      | { type: 'enterprise'; enterprise: EnterpriseDocument },
  ) {
    const user = await this.userModel.findById(userId)
    if (!user || !(await this.findSpaceMembership(user, space))) {
      throw new BadRequestException('您不属于该空间')
    }
  }

  private async assertSpaceManager(
    userId: string,
    space:
      | { type: 'team'; team: TeamDocument; enterprise: EnterpriseDocument }
      | { type: 'enterprise'; enterprise: EnterpriseDocument },
  ) {
    const user = await this.userModel.findById(userId)
    const membership = user ? await this.findSpaceMembership(user, space) : undefined

    const permissions = membership ? this.permissionsForRole(space.type, membership.role) : []

    if (
      !membership ||
      !permissions.includes(
        space.type === 'team' ? 'manage_team_members' : 'manage_enterprise_members',
      )
    ) {
      throw new BadRequestException('您在该空间中不是管理员，无权邀请成员')
    }
  }

  private mapLegacyRoleToEnterpriseRole(role: Role): EnterpriseRole {
    if (role === Role.OWNER || role === Role.ADMIN) return EnterpriseRole.ENTERPRISE_ADMIN
    return EnterpriseRole.MEMBER
  }

  private mapLegacyRoleToTeamRole(role: Role): TeamRole {
    if (role === Role.OWNER || role === Role.ADMIN) return TeamRole.TEAM_ADMIN
    if (role === Role.VIEWER) return TeamRole.VIEWER
    return TeamRole.CREATOR
  }

  private mapEnterpriseRoleToLegacyRole(role: EnterpriseRole): Role {
    if (role === EnterpriseRole.ENTERPRISE_ADMIN) return Role.ADMIN
    return Role.MEMBER
  }

  private mapTeamRoleToLegacyRole(role: TeamRole): Role {
    if (role === TeamRole.TEAM_ADMIN) return Role.ADMIN
    if (role === TeamRole.VIEWER) return Role.VIEWER
    return Role.MEMBER
  }

  private async syncLegacyMembershipRole(
    user: UserDocument,
    enterpriseId: Types.ObjectId,
    teamId: Types.ObjectId | undefined,
    role: Role,
  ) {
    const membership = user.memberships.find((item) => {
      const sameEnterprise = item.enterpriseId.toString() === enterpriseId.toString()
      const sameTeam = teamId ? item.teamId?.toString() === teamId.toString() : !item.teamId
      return sameEnterprise && sameTeam
    })

    if (membership) {
      membership.role = role
      await user.save()
    }
  }

  private permissionsForRole(spaceType: SpaceType, role: Role | EnterpriseRole | TeamRole) {
    if (spaceType === 'personal') return ['*']

    if (spaceType === 'enterprise') {
      if (role === EnterpriseRole.ENTERPRISE_ADMIN) {
        return [
          'manage_enterprise',
          'manage_enterprise_members',
          'manage_enterprise_teams',
          'manage_enterprise_policy',
          'manage_enterprise_brand_rules',
          'manage_enterprise_knowledge',
          'read_enterprise_knowledge',
          'use_enterprise_knowledge',
        ]
      }
      if (role === EnterpriseRole.BRAND_MANAGER) {
        return [
          'manage_enterprise_brand_rules',
          'manage_enterprise_knowledge',
          'upload_enterprise_assets',
          'read_enterprise_knowledge',
          'use_enterprise_knowledge',
        ]
      }
      return ['read_enterprise_knowledge', 'use_enterprise_knowledge']
    }

    if (role === TeamRole.TEAM_ADMIN) {
      return [
        'manage_team',
        'manage_team_members',
        'manage_team_knowledge',
        'review_team_content',
        'upload_team_assets',
        'create_team_works',
        'use_team_knowledge',
      ]
    }
    if (role === TeamRole.KNOWLEDGE_MANAGER) {
      return ['manage_team_knowledge', 'review_team_content', 'use_team_knowledge']
    }
    if (role === TeamRole.CREATOR) {
      return ['upload_team_assets', 'create_team_works', 'use_team_knowledge']
    }
    return ['read_team_knowledge', 'use_team_knowledge']
  }
}
