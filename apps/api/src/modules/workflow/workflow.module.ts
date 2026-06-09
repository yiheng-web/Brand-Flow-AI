import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { MongooseModule } from '@nestjs/mongoose'
import { WORKFLOW_QUEUE } from './workflow.constants'
import { WorkflowController } from './workflow.controller'
import { WorkflowProcessor } from './workflow.processor'
import { WorkflowService } from './workflow.service'
import { Workflow, WorkflowSchema } from './schemas/workflow.schema'
import { WorkflowNode, WorkflowNodeSchema } from './schemas/workflow-node.schema'
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
    ]),
    BullModule.registerQueue({
      name: WORKFLOW_QUEUE,
    }),
    KnowledgeModule,
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowProcessor],
})
export class WorkflowModule {}
