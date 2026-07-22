import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrgModule } from '@/modules/org/org.module'
import { StorageModule } from '@/modules/storage/storage.module'
import { Work, WorkSchema } from './schemas/work.schema'
import { WorkVersion, WorkVersionSchema } from './schemas/work-version.schema'
import { ExportLog, ExportLogSchema } from './schemas/export-log.schema'
import { WorksController } from './works.controller'
import { WorksService } from './works.service'
import { Workflow, WorkflowSchema } from '../workflow/schemas/workflow.schema'
import { WorkflowNode, WorkflowNodeSchema } from '../workflow/schemas/workflow-node.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Work.name, schema: WorkSchema },
      { name: WorkVersion.name, schema: WorkVersionSchema },
      { name: ExportLog.name, schema: ExportLogSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
    ]),
    OrgModule,
    StorageModule,
  ],
  controllers: [WorksController],
  providers: [WorksService],
  exports: [WorksService],
})
export class WorksModule {}
