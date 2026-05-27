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
    return {
      userId: payload.sub,
      email: payload.email,
      enterpriseId: payload.entId,
      role: payload.role,
    }
  }
}

/** MVP 开发演示：允许前端默认 demo-token（非生产环境） */
export function validateDemoToken(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') return false
  const auth = request.headers.authorization
  if (auth === 'Bearer demo-token') return true
  const q = request.query.token
  return q === 'demo-token'
}
