import { MembershipService } from './membership.service'
import { ActivityService } from './activity.service'
import {
  AuditLog,
  AuditLogSchema,
  Notification,
  NotificationSchema,
} from './schemas/activity.schema'
import { InvitationService } from './invitation.service'
import { Invitation, InvitationSchema } from './schemas/invitation.schema'
import { AuthorizationService } from './authorization.service'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from './schemas/user.schema'
import { Team, TeamSchema } from './schemas/team.schema'
import { Enterprise, EnterpriseSchema } from './schemas/enterprise.schema'
import { OrgService } from './org.service'
import { OrgController } from './org.controller'

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Invitation.name, schema: InvitationSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Enterprise.name, schema: EnterpriseSchema },
    ]),
  ],
  controllers: [OrgController],
  providers: [
    OrgService,
    AuthorizationService,
    MembershipService,
    InvitationService,
    ActivityService,
  ],
  exports: [MongooseModule, OrgService, AuthorizationService, ActivityService],
})
export class OrgModule {}
