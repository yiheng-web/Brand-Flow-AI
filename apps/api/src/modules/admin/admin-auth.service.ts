import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import * as bcrypt from 'bcrypt'
import { PlatformRole } from '@/common/enums'
import { AdminLoginDto } from './dto/admin-auth.dto'
import { PlatformAdmin, PlatformAdminDocument } from './schemas/platform-admin.schema'

@Injectable()
export class AdminAuthService implements OnModuleInit {
  constructor(
    @InjectModel(PlatformAdmin.name)
    private readonly platformAdminModel: Model<PlatformAdminDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin()
  }

  async login(loginDto: AdminLoginDto) {
    const admin = await this.platformAdminModel
      .findOne({ email: loginDto.email })
      .select('+password')

    if (!admin) {
      throw new UnauthorizedException('邮箱或密码错误')
    }

    if (admin.status !== 'active') {
      throw new UnauthorizedException('后台账号已被禁用')
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, admin.password)
    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱或密码错误')
    }

    admin.lastLoginAt = new Date()
    await admin.save()

    const adminUser = this.toAdminUser(admin)

    return {
      token: this.jwtService.sign({
        sub: admin._id,
        email: admin.email,
        type: 'platform_admin',
        platformRole: admin.role,
      }),
      adminUser,
    }
  }

  me(admin: any) {
    return admin
  }

  logout() {
    return { success: true }
  }

  private toAdminUser(admin: PlatformAdminDocument) {
    return {
      userId: admin._id.toString(),
      email: admin.email,
      name: admin.name,
      platformRole: admin.role,
      permissions: admin.permissions,
    }
  }

  private async ensureDefaultAdmin() {
    const email = this.configService.get<string>('PLATFORM_ADMIN_EMAIL')
    const password = this.configService.get<string>('PLATFORM_ADMIN_PASSWORD')

    if (!email || !password) {
      return
    }

    const exists = await this.platformAdminModel.findOne({ email })
    if (exists) {
      return
    }

    await this.platformAdminModel.create({
      email,
      password: await bcrypt.hash(password, 10),
      name: this.configService.get<string>('PLATFORM_ADMIN_NAME') ?? '平台超级管理员',
      role: PlatformRole.SUPER_ADMIN,
      permissions: ['*'],
      status: 'active',
    })
  }
}
