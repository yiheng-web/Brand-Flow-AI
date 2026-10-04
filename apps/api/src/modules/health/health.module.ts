import { Module } from '@nestjs/common'
import { LimitsModule } from '../limits/limits.module'
import { StorageModule } from '../storage/storage.module'
import { HealthController } from './health.controller'

@Module({ imports: [LimitsModule, StorageModule], controllers: [HealthController] })
export class HealthModule {}
