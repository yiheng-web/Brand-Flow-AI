import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import * as bcrypt from 'bcrypt'
import { User, UserDocument } from '@/modules/org/schemas/user.schema'
import { RegisterDto, LoginDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
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

    const currentMembership = user.memberships.find(
      (m) => m.enterpriseId.toString() === user.currentEnterpriseId?.toString(),
    )

    const payload = {
      sub: user._id,
      email: user.email,
      entId: user.currentEnterpriseId,
      role: currentMembership?.role || null,
    }

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        email: user.email,
        profile: user.profile,
        currentEnterpriseId: user.currentEnterpriseId,
      },
    }
  }
}
