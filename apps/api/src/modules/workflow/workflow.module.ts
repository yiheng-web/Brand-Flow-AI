import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { MongooseModule } from '@nestjs/mongoose'
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module'
import { WORKFLOW_QUEUE } from './workflow.constants'
import { WorkflowController } from './workflow.controller'
import { WorkflowProcessor } from './workflow.processor'
import { WorkflowService } from './workflow.service'
import { Workflow, WorkflowSchema } from './schemas/workflow.schema'

@Module({
  imports: [
    KnowledgeModule,
    MongooseModule.forFeature([{ name: Workflow.name, schema: WorkflowSchema }]),
    BullModule.registerQueue({
      name: WORKFLOW_QUEUE,
    }),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowProcessor],
})
export class WorkflowModule {}
