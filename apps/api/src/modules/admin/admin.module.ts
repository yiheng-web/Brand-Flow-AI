import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'
import { AdminAuthController } from './admin-auth.controller'
import { AdminAuthService } from './admin-auth.service'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { AuditLogService } from './audit-log.service'
import { PlatformAdmin, PlatformAdminSchema } from './schemas/platform-admin.schema'
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema'
import { PlatformAdminGuard } from './guards/platform-admin.guard'
import { PlatformPermissionGuard } from './guards/platform-permission.guard'
import { User, UserSchema } from '@/modules/org/schemas/user.schema'
import { Enterprise, EnterpriseSchema } from '@/modules/org/schemas/enterprise.schema'
import { Team, TeamSchema } from '@/modules/org/schemas/team.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformAdmin.name, schema: PlatformAdminSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Enterprise.name, schema: EnterpriseSchema },
      { name: Team.name, schema: TeamSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default_secret',
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminController],
  providers: [
    AdminAuthService,
    AdminService,
    AuditLogService,
    PlatformAdminGuard,
    PlatformPermissionGuard,
  ],
  exports: [AdminAuthService, AuditLogService, PlatformAdminGuard, PlatformPermissionGuard],
})
export class AdminModule {}
