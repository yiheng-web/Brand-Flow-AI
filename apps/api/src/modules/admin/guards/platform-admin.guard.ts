import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { PlatformAdmin, PlatformAdminDocument } from '../schemas/platform-admin.schema'

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(PlatformAdmin.name)
    private readonly platformAdminModel: Model<PlatformAdminDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authorization = request.headers?.authorization

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少后台登录凭证')
    }

    const token = authorization.replace('Bearer ', '')
    const payload = await this.jwtService.verifyAsync(token).catch(() => null)

    if (!payload || payload.type !== 'platform_admin') {
      throw new UnauthorizedException('后台登录凭证无效')
    }

    const admin = await this.platformAdminModel.findById(payload.sub)
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('后台账号不可用')
    }

    request.admin = {
      userId: admin._id.toString(),
      email: admin.email,
      name: admin.name,
      platformRole: admin.role,
      permissions: admin.permissions,
    }

    return true
  }
}
