import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User } from '@/modules/org/schemas/user.schema'
import type { UserDocument } from '@/modules/org/schemas/user.schema'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    })
  }

  async validate(payload: { sub: string; email?: string; entId?: string; role?: string }) {
    if (typeof payload.sub !== 'string' || !Types.ObjectId.isValid(payload.sub))
      throw new UnauthorizedException('登录身份无效')
    // 每次鉴权复查账号，禁用或删除后旧 JWT 立即失效。
    const user = await this.userModel.findById(payload.sub)
    if (!user || user.status !== 'active') throw new UnauthorizedException('账号不存在或已停用')
    const membership = user.memberships.find(
      (item) => !item.teamId && item.enterpriseId.toString() === payload.entId,
    )
    // 退出组织只撤销企业上下文，账号仍可使用个人空间与邀请中心。
    return {
      sub: payload.sub,
      email: user.email,
      entId: membership ? payload.entId : undefined,
      role: membership?.role ?? null,
    }
  }
}
