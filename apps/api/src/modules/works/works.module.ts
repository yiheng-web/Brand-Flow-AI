import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrgModule } from '@/modules/org/org.module'
import { StorageModule } from '@/modules/storage/storage.module'
import { Work, WorkSchema } from './schemas/work.schema'
import { WorkVersion, WorkVersionSchema } from './schemas/work-version.schema'
import { WorksController } from './works.controller'
import { WorksService } from './works.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Work.name, schema: WorkSchema },
      { name: WorkVersion.name, schema: WorkVersionSchema },
    ]),
    OrgModule,
    StorageModule,
  ],
  controllers: [WorksController],
  providers: [WorksService],
  exports: [WorksService],
})
export class WorksModule {}
