import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Enterprise, EnterpriseDocument } from './schemas/enterprise.schema'
import { User, UserDocument } from './schemas/user.schema'
import { Team, TeamDocument } from './schemas/team.schema'
import { Role } from '@/common/enums'
import { CreateEnterpriseDto, CreateTeamDto } from './dto/org.dto'

@Injectable()
export class OrgService {
  constructor(
    @InjectModel(Enterprise.name) private enterpriseModel: Model<EnterpriseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
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

    const exists = await this.teamModel.findOne({ enterpriseId, name })
    if (exists) {
      throw new BadRequestException('该企业下已存在同名团队')
    }

    const team = await this.teamModel.create({
      enterpriseId,
      name,
      description,
    })

    return team
  }

  async getTeams(enterpriseId: string) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    return this.teamModel.find({ enterpriseId })
  }
}
