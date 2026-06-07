import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from './schemas/user.schema'
import { Team, TeamSchema } from './schemas/team.schema'
import { Enterprise, EnterpriseSchema } from './schemas/enterprise.schema'
import {
  EnterpriseMembership,
  EnterpriseMembershipSchema,
} from './schemas/enterprise-membership.schema'
import { TeamMembership, TeamMembershipSchema } from './schemas/team-membership.schema'
import { OrgService } from './org.service'
import { OrgController } from './org.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Enterprise.name, schema: EnterpriseSchema },
      { name: EnterpriseMembership.name, schema: EnterpriseMembershipSchema },
      { name: TeamMembership.name, schema: TeamMembershipSchema },
    ]),
  ],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [MongooseModule, OrgService],
})
export class OrgModule {}
