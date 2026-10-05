import { AuthorizationService } from './authorization.service'
import { assertObjectId } from '@/common/personal-scope'
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Enterprise, EnterpriseDocument } from './schemas/enterprise.schema'
import { User, UserDocument } from './schemas/user.schema'
import { Team, TeamDocument } from './schemas/team.schema'
import { Role } from '@/common/enums'
import { CreateEnterpriseDto, CreateTeamDto, InviteSpaceMemberDto } from './dto/org.dto'
import { JwtService } from '@nestjs/jwt'

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

    const enterprises = new Map<string, EnterpriseDocument>()
    for (const membership of user.memberships as unknown as PopulatedMembership[]) {
      if (membership.enterpriseId?._id)
        enterprises.set(membership.enterpriseId._id.toString(), membership.enterpriseId)
    }
    return Promise.all(
      [...enterprises].map(async ([id, enterprise]) => ({
        role: (await this.authorization.assertCanReadSpace(userId, id)).role,
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
    const { name, description } = createDto

    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业再创建团队')
    }

    const space = await this.authorization.assertCanManageMembers(userId, enterpriseId)
    if (space.spaceType !== 'enterprise') throw new BadRequestException('目标必须为企业')
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
          role: Role.ADMIN,
        },
      },
    })

    return team
  }

  async getTeams(enterpriseId: string, userId: string) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const space = await this.authorization.assertCanReadSpace(userId, enterpriseId)
    if (space.spaceType !== 'enterprise') throw new BadRequestException('目标必须为企业')
    if (space.permissions.manageMembers) return this.teamModel.find({ enterpriseId })
    const user = await this.userModel.findById(userId)
    const teamIds =
      user?.memberships
        .filter((item) => item.enterpriseId.toString() === enterpriseId && item.teamId)
        .map((item) => item.teamId) ?? []
    return this.teamModel.find({ enterpriseId, _id: { $in: teamIds } })
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

      if (team?._id) {
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
        ...(await this.authorization.assertCanReadSpace(userId, space.spaceId)),
      })),
    )
    const managedEnterprises = authorizedSpaces
      .filter((space) => space.type === 'enterprise' && space.permissions.manageMembers)
      .map((space) => new Types.ObjectId(space.spaceId))
    const teams = await this.teamModel.find({ enterpriseId: { $in: managedEnterprises } })
    for (const team of teams) {
      const id = team._id.toString()
      if (!seen.has(id)) {
        seen.add(id)
        authorizedSpaces.push({
          id,
          type: 'team',
          name: team.name,
          teamId: id,
          ...(await this.authorization.assertCanReadSpace(userId, id)),
        })
      }
    }
    return authorizedSpaces
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
    await this.authorization.assertCanReadSpace(userId, spaceId)

    const users =
      space.type === 'team'
        ? await this.userModel.find({ 'memberships.teamId': space.team._id })
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
    if (spaceId === 'personal') {
      throw new BadRequestException('个人空间不支持邀请成员')
    }

    const space = await this.resolveSpace(spaceId)
    await this.authorization.assertCanManageMembers(userId, spaceId)
    this.authorization.assertInvitableRole(inviteDto.role)

    const targetUser = await this.userModel.findOne({ email: inviteDto.email })
    if (!targetUser) {
      throw new NotFoundException('被邀请用户不存在，请先注册账号')
    }

    if (
      space.type === 'team' &&
      !targetUser.memberships.some(
        (item) => item.enterpriseId.toString() === space.enterprise._id.toString(),
      )
    )
      throw new BadRequestException('请先将用户加入团队所属企业')

    const exists = this.findSpaceMembership(targetUser, space)
    if (exists) {
      throw new BadRequestException('该用户已经在空间中')
    }

    const membership = {
      enterpriseId: space.enterprise._id as Types.ObjectId,
      ...(space.type === 'team' ? { teamId: space.team._id as Types.ObjectId } : {}),
      role: inviteDto.role ?? Role.MEMBER,
    } as UserDocument['memberships'][number]
    targetUser.memberships.push(membership)

    await targetUser.save()

    return {
      success: true,
      spaceId,
      userId: targetUser._id,
      email: targetUser.email,
      role: inviteDto.role ?? Role.MEMBER,
    }
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
