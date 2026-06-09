import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { User, UserSchema } from './schemas/user.schema'
import { Team, TeamSchema } from './schemas/team.schema'
import { Workspace, WorkspaceSchema } from './schemas/workspace.schema'
import { Membership, MembershipSchema } from './schemas/membership.schema'
import { Space, SpaceSchema } from './schemas/space.schema'
import { Invitation, InvitationSchema } from './schemas/invitation.schema'
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema'
import { OrgService } from './org.service'
import { OrgController } from './org.controller'

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default_secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: Space.name, schema: SpaceSchema },
      { name: Invitation.name, schema: InvitationSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [MongooseModule, OrgService],
})
export class OrgModule {}
