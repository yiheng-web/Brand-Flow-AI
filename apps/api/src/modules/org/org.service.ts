import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { Model, Types } from 'mongoose'
import { Role } from '@/common/enums'
import { assertObjectId } from '@/common/personal-scope'
import { AuthorizationService } from './authorization.service'
import { MembershipService } from './membership.service'
import { InvitationService } from './invitation.service'
import type {
  CreateEnterpriseDto,
  CreateTeamDto,
  InviteSpaceMemberDto,
  UpdateEnterpriseDto,
  UpdateTeamDto,
} from './dto/org.dto'
import { Enterprise, type EnterpriseDocument } from './schemas/enterprise.schema'
import { User, type UserDocument } from './schemas/user.schema'
import { Team, type TeamDocument } from './schemas/team.schema'

interface PopulatedMembership {
  role: Role
  enterpriseId: EnterpriseDocument
  teamId?: TeamDocument
}

@Injectable()
export class OrgService {
  constructor(
    @InjectModel(Enterprise.name) private enterpriseModel: Model<EnterpriseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    private readonly jwtService: JwtService,
    readonly authorization: AuthorizationService,
    readonly memberships: MembershipService,
    readonly invitations: InvitationService,
    private readonly config: ConfigService,
  ) {}

  async createEnterprise(userId: string, createDto: CreateEnterpriseDto) {
    assertObjectId(userId)
    const limit = Number(this.config.get('ORG_MAX_OWNED_ENTERPRISES', 5))
    if (!Number.isInteger(limit) || limit < 1) throw new BadRequestException('企业创建上限配置无效')
    return this.memberships.atomic(async (session) => {
      const user = await this.userModel.findById(userId, null, { session })
      if (!user) throw new NotFoundException('用户不存在')
      if (
        user.memberships.filter((item) => !item.teamId && item.role === Role.OWNER).length >= limit
      )
        throw new BadRequestException(`最多拥有 ${limit} 家企业`)
      const name = createDto.name.trim()
      if (await this.enterpriseModel.findOne({ name }, null, { session }))
        throw new BadRequestException('该企业名称已被使用')
      const [enterprise] = await this.enterpriseModel.create(
        [{ ...createDto, name, status: 'active' }],
        { session },
      )
      user.memberships.push({ enterpriseId: enterprise._id, role: Role.OWNER })
      user.currentEnterpriseId = enterprise._id
      await user.save({ session })
      return enterprise
    })
  }

  async getEnterprise(userId: string, id: string) {
    const space = await this.authorization.assertCanReadOrganization(userId, id)
    if (space.spaceType !== 'enterprise') throw new BadRequestException('目标必须为企业')
    const enterprise = await this.enterpriseModel.findById(id)
    return {
      enterpriseId: id,
      name: enterprise!.name,
      logo: enterprise!.logo,
      status: enterprise!.status,
      role: space.role,
      permissions: space.permissions,
    }
  }

  async updateEnterprise(userId: string, id: string, dto: UpdateEnterpriseDto) {
    const initial = await this.authorization.assertCanManageOrganization(userId, id)
    if (initial.spaceType !== 'enterprise') throw new BadRequestException('目标必须为企业')
    return this.memberships.transaction(id, async (session) => {
      await this.authorization.assertCanManageOrganization(userId, id, session)
      const update = { ...dto, ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) }
      if (
        dto.name &&
        (await this.enterpriseModel.findOne({ _id: { $ne: id }, name: update.name }, null, {
          session,
        }))
      )
        throw new BadRequestException('该企业名称已被使用')
      return this.enterpriseModel.findByIdAndUpdate(
        id,
        { $set: update },
        { new: true, session, runValidators: true },
      )
    })
  }

  async getTeam(userId: string, id: string) {
    const space = await this.authorization.assertCanReadOrganization(userId, id)
    if (space.spaceType !== 'team') throw new BadRequestException('目标必须为团队')
    const team = await this.teamModel.findOne({ _id: id, enterpriseId: space.enterpriseId })
    return { ...team!.toObject(), role: space.role, permissions: space.permissions }
  }

  async updateTeam(userId: string, id: string, dto: UpdateTeamDto) {
    const initial = await this.authorization.assertCanManageOrganization(userId, id)
    if (initial.spaceType !== 'team') throw new BadRequestException('目标必须为团队')
    return this.memberships.transaction(initial.enterpriseId!, async (session) => {
      const space = await this.authorization.assertCanManageOrganization(userId, id, session)
      const update = { ...dto, ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) }
      if (
        dto.name &&
        (await this.teamModel.findOne(
          { _id: { $ne: id }, enterpriseId: space.enterpriseId, name: update.name },
          null,
          { session },
        ))
      )
        throw new BadRequestException('该企业下已存在同名团队')
      return this.teamModel.findOneAndUpdate(
        { _id: id, enterpriseId: space.enterpriseId },
        { $set: update },
        { new: true, session, runValidators: true },
      )
    })
  }

  async getMyEnterprises(userId: string) {
    const user = await this.userModel.findById(userId).populate({
      path: 'memberships.enterpriseId',
      model: Enterprise.name,
    })

    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const enterprises = new Map<string, EnterpriseDocument>()
    for (const membership of user.memberships as unknown as PopulatedMembership[]) {
      if (membership.enterpriseId?._id)
        enterprises.set(membership.enterpriseId._id.toString(), membership.enterpriseId)
    }
    return Promise.all(
      [...enterprises].map(async ([id, enterprise]) => ({
        ...(await this.authorization.assertCanReadOrganization(userId, id)),
        enterpriseId: id,
        name: enterprise.name,
        logo: enterprise.logo,
        status: enterprise.status,
      })),
    )
  }

  async switchEnterprise(userId: string, enterpriseId: string) {
    assertObjectId(enterpriseId)
    const space = await this.authorization.assertCanReadSpace(userId, enterpriseId)
    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const isMember = user.memberships.some((m) => m.enterpriseId.toString() === enterpriseId)

    if (!isMember) {
      throw new BadRequestException('您不属于该企业，无法切换')
    }

    user.currentEnterpriseId = new Types.ObjectId(enterpriseId)
    await user.save()

    const accessToken = this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
      entId: enterpriseId,
      role: space.role,
    })
    return { success: true, currentEnterpriseId: enterpriseId, access_token: accessToken }
  }

  async createTeam(userId: string, enterpriseId: string, createDto: CreateTeamDto) {
    if (!enterpriseId) throw new BadRequestException('请先选择企业')
    const initial = await this.authorization.assertCanManageMembers(userId, enterpriseId)
    if (initial.spaceType !== 'enterprise') throw new BadRequestException('目标必须为企业')
    return this.memberships.transaction(enterpriseId, async (session) => {
      await this.authorization.assertCanManageMembers(userId, enterpriseId, session)
      const name = createDto.name.trim()
      if (await this.teamModel.findOne({ enterpriseId, name }, null, { session }))
        throw new BadRequestException('该企业下已存在同名团队')
      const [team] = await this.teamModel.create([{ ...createDto, name, enterpriseId }], {
        session,
      })
      await this.userModel.findByIdAndUpdate(
        userId,
        { $push: { memberships: { enterpriseId, teamId: team._id, role: Role.ADMIN } } },
        { session },
      )
      return team
    })
  }

  async getTeams(enterpriseId: string, userId: string) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const space = await this.authorization.assertCanReadOrganization(userId, enterpriseId)
    if (space.spaceType !== 'enterprise') throw new BadRequestException('目标必须为企业')
    const user = await this.userModel.findById(userId)
    const teamIds =
      user?.memberships
        .filter((item) => item.enterpriseId.toString() === enterpriseId && item.teamId)
        .map((item) => item.teamId) ?? []
    const teams = await this.teamModel.find({
      enterpriseId,
      ...(!space.permissions.manageOrganization ? { _id: { $in: teamIds } } : {}),
    })
    return Promise.all(
      teams.map(async (team) => ({
        ...team.toObject(),
        ...(await this.authorization.assertCanReadOrganization(userId, team._id.toString())),
      })),
    )
  }

  async getMySpaces(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate({ path: 'memberships.enterpriseId', model: Enterprise.name })
      .populate({ path: 'memberships.teamId', model: Team.name })

    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const spaces: Array<{
      id: string
      spaceId: string
      type: 'personal' | 'team' | 'enterprise'
      name: string
      role: Role
      enterpriseId?: string
      teamId?: string
    }> = [
      {
        id: 'personal',
        spaceId: 'personal',
        type: 'personal',
        name: '个人空间',
        role: Role.OWNER,
      },
    ]

    const seen = new Set<string>(['personal'])

    for (const membership of user.memberships as unknown as PopulatedMembership[]) {
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
            enterpriseId: enterpriseSpaceId,
            name: enterprise.name,
            role: membership.role,
          })
        }
      }

      if (team?._id && enterprise?._id) {
        const teamSpaceId = team._id.toString()
        if (!seen.has(teamSpaceId)) {
          seen.add(teamSpaceId)
          spaces.push({
            id: teamSpaceId,
            spaceId: teamSpaceId,
            type: 'team',
            enterpriseId: enterprise._id.toString(),
            teamId: teamSpaceId,
            name: team.name,
            role: membership.role,
          })
        }
      }
    }

    const authorizedSpaces = await Promise.all(
      spaces.map(async (space) => ({
        ...space,
        ...(await this.authorization.assertCanReadOrganization(userId, space.spaceId)),
      })),
    )
    const managedEnterprises = authorizedSpaces
      .filter((space) => space.type === 'enterprise' && space.permissions.manageMembers)
      .map((space) => new Types.ObjectId(space.spaceId))
    const teams = await this.teamModel.find({
      enterpriseId: { $in: managedEnterprises },
      status: { $ne: 'archived' },
    })
    for (const team of teams) {
      const id = team._id.toString()
      if (!seen.has(id)) {
        seen.add(id)
        authorizedSpaces.push({
          id,
          type: 'team',
          teamId: id,
          ...(await this.authorization.assertCanReadSpace(userId, id)),
        })
      }
    }
    return authorizedSpaces.filter((space) => space.permissions.read)
  }

  async getAccessibleSpace(userId: string, spaceId: string) {
    return this.authorization.assertCanReadSpace(userId, spaceId)
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
    await this.authorization.assertCanReadOrganization(userId, spaceId)

    const users =
      space.type === 'team'
        ? await this.userModel.find({
            memberships: {
              $elemMatch: { enterpriseId: space.enterprise._id, teamId: space.team._id },
            },
          })
        : await this.userModel.find({ 'memberships.enterpriseId': space.enterprise._id })

    return users.map((user) => {
      const membership = this.findSpaceMembership(user as UserDocument, space)

      return {
        userId: user._id,
        email: user.email,
        nickname: user.profile?.nickname,
        avatar: user.profile?.avatar,
        role: membership?.role ?? Role.VIEWER,
      }
    })
  }

  async inviteSpaceMember(userId: string, spaceId: string, inviteDto: InviteSpaceMemberDto) {
    await this.authorization.assertCanManageMembers(userId, spaceId)
    this.authorization.assertInvitableRole(inviteDto.role)
    return this.invitations.create(userId, spaceId, inviteDto)
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

  private findSpaceMembership(
    user: UserDocument,
    space:
      | { type: 'team'; team: TeamDocument; enterprise: EnterpriseDocument }
      | { type: 'enterprise'; enterprise: EnterpriseDocument },
  ) {
    return user.memberships.find(
      (item) =>
        item.enterpriseId.toString() === space.enterprise._id.toString() &&
        (space.type === 'team'
          ? item.teamId?.toString() === space.team._id.toString()
          : !item.teamId),
    )
  }
}
