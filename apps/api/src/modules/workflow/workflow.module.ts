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
import { Knowledge, KnowledgeSchema } from '../knowledge/schemas/knowledge.schema'
import { KnowledgeItem, KnowledgeItemSchema } from '../knowledge/schemas/knowledge-item.schema'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
      { name: Knowledge.name, schema: KnowledgeSchema },
      { name: KnowledgeItem.name, schema: KnowledgeItemSchema },
    ]),
    OrgModule,
    StorageModule,
    BullModule.registerQueue({
      name: WORKFLOW_QUEUE,
    }),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowProcessor],
})
export class WorkflowModule {}
