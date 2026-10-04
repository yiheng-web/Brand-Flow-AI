import { Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { LimitsService } from './limits.service'

@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(private readonly limits: LimitsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    await this.limits.authenticate(
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      context.getHandler().name,
    )
    return true
  }
}
