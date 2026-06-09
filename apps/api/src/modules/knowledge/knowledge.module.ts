import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { KnowledgeService } from './knowledge.service'
import { KnowledgeController } from './knowledge.controller'
import { Knowledge, KnowledgeSchema } from './schemas/knowledge.schema'
import { KnowledgeItem, KnowledgeItemSchema } from './schemas/knowledge-item.schema'
import { OrgModule } from '@/modules/org/org.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Knowledge.name, schema: KnowledgeSchema },
      { name: KnowledgeItem.name, schema: KnowledgeItemSchema },
    ]),
    OrgModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
