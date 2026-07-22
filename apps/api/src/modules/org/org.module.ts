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
