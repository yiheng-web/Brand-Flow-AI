import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

interface JwtPayload {
  sub: string
  email: string
  entId?: string
  role?: string
}

function extractTokenFromQuery(request: Request): string | null {
  const token = request.query.token
  return typeof token === 'string' ? token : null
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractTokenFromQuery,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default_secret',
    })
  }

  async validate(payload: JwtPayload) {
    // 返回对象将挂载到 req.user
    return {
      userId: payload.sub,
      email: payload.email,
      enterpriseId: payload.entId,
      role: payload.role,
    }
  }
}
