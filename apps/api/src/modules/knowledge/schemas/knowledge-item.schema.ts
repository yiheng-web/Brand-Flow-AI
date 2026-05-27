import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'
import { KNOWLEDGE_TYPES, type KnowledgeType } from '@brand-flow/common'

export type KnowledgeItemDocument = KnowledgeItemEntity &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true, collection: 'knowledge_items' })
export class KnowledgeItemEntity {
  @Prop({ required: true, index: true })
  spaceId!: string

  @Prop({ type: String, enum: KNOWLEDGE_TYPES, required: true, index: true })
  type!: KnowledgeType

  @Prop({ required: true })
  title!: string

  @Prop()
  description?: string

  @Prop({ type: [String], default: [] })
  tags!: string[]

  @Prop({ type: Object, default: {} })
  content!: Record<string, unknown>

  @Prop()
  assetUrl?: string

  @Prop({ default: true, index: true })
  enabled!: boolean
}

export const KnowledgeItemSchema = SchemaFactory.createForClass(KnowledgeItemEntity)
