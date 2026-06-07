import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { MongooseModule } from '@nestjs/mongoose'
import { WORKFLOW_QUEUE } from './workflow.constants'
import { WorkflowController } from './workflow.controller'
import { WorkflowProcessor } from './workflow.processor'
import { WorkflowService } from './workflow.service'
import { Workflow, WorkflowSchema } from './schemas/workflow.schema'
import { WorkflowNode, WorkflowNodeSchema } from './schemas/workflow-node.schema'
import { OrgModule } from '../org/org.module'
import { KnowledgeModule } from '../knowledge/knowledge.module'

@Module({
  imports: [
    OrgModule,
    KnowledgeModule,
    MongooseModule.forFeature([
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
    ]),
    BullModule.registerQueue({
      name: WORKFLOW_QUEUE,
    }),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowProcessor],
})
export class WorkflowModule {}
