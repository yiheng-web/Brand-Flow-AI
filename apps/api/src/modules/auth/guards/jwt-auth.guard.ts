import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Request } from 'express'

import { validateDemoToken } from './jwt.strategy'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    if (validateDemoToken(request)) {
      request.user = {
        userId: 'demo-user',
        email: 'demo@local',
        enterpriseId: undefined,
        role: 'personal',
      }
      return true
    }
    return super.canActivate(context)
  }
}
