import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from './schemas/user.schema'
import { Team, TeamSchema } from './schemas/team.schema'
import { Enterprise, EnterpriseSchema } from './schemas/enterprise.schema'
import { OrgService } from './org.service'
import { OrgController } from './org.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Enterprise.name, schema: EnterpriseSchema },
    ]),
  ],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [MongooseModule, OrgService],
})
export class OrgModule {}
