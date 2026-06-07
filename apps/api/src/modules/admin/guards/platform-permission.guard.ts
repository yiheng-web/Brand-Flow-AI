import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PLATFORM_PERMISSIONS_KEY } from '../decorators/platform-permissions.decorator'

@Injectable()
export class PlatformPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!requiredPermissions?.length) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const permissions: string[] = request.admin?.permissions ?? []

    if (permissions.includes('*')) {
      return true
    }

    const hasPermission = requiredPermissions.every((permission) =>
      permissions.includes(permission),
    )

    if (!hasPermission) {
      throw new ForbiddenException('缺少后台操作权限')
    }

    return true
  }
}
