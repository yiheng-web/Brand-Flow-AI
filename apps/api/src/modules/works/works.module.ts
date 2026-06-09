import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrgModule } from '@/modules/org/org.module'
import { StorageModule } from '@/modules/storage/storage.module'
import { Work, WorkSchema } from './schemas/work.schema'
import { WorkVersion, WorkVersionSchema } from './schemas/work-version.schema'
import { ExportLog, ExportLogSchema } from './schemas/export-log.schema'
import { Workflow, WorkflowSchema } from '@/modules/workflow/schemas/workflow.schema'
import { WorksController } from './works.controller'
import { WorksService } from './works.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Work.name, schema: WorkSchema },
      { name: WorkVersion.name, schema: WorkVersionSchema },
      { name: ExportLog.name, schema: ExportLogSchema },
      { name: Workflow.name, schema: WorkflowSchema },
    ]),
    OrgModule,
    StorageModule,
  ],
  controllers: [WorksController],
  providers: [WorksService],
  exports: [WorksService],
})
export class WorksModule {}
