import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import * as bcrypt from 'bcrypt'
import { User, UserDocument } from '@/modules/org/schemas/user.schema'
import { Membership, MembershipDocument } from '@/modules/org/schemas/membership.schema'
import { OrgService } from '@/modules/org/org.service'
import { RegisterDto, LoginDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    private jwtService: JwtService,
    private orgService: OrgService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, nickname } = registerDto

    const exists = await this.userModel.findOne({ email })
    if (exists) {
      throw new BadRequestException('该邮箱已被注册')
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await this.userModel.create({
      email,
      password: hashedPassword,
      profile: { nickname },
      status: 'active',
    })

    await this.orgService.createPersonalWorkspace(user._id.toString(), nickname || email)

    return {
      userId: user._id,
      email: user.email,
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto

    const user = await this.userModel.findOne({ email }).select('+password')
    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误')
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱或密码错误')
    }

    const currentMembership = await this.membershipModel
      .findOne({
        userId: user._id,
        scopeType: 'workspace',
        status: 'active',
      })
      .sort({ createdAt: 1 })

    const payload = {
      sub: user._id,
      email: user.email,
      workspaceId: currentMembership?.workspaceId,
      role: currentMembership?.role || null,
    }

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        email: user.email,
        profile: user.profile,
        activeWorkspaceId: currentMembership?.workspaceId,
      },
    }
  }
}
