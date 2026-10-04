import { Module } from '@nestjs/common'
import { OrgModule } from '../org/org.module'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { WORKFLOW_QUEUE } from '../workflow/workflow.constants'
import { LimitsService } from './limits.service'
import { AuthRateGuard } from './auth-rate.guard'

@Module({
  imports: [OrgModule, ConfigModule, BullModule.registerQueue({ name: WORKFLOW_QUEUE })],
  providers: [LimitsService, AuthRateGuard],
  exports: [LimitsService, AuthRateGuard, BullModule],
})
export class LimitsModule {}
