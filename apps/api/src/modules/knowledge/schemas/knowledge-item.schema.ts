import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type KnowledgeItemSourceType = 'manual' | 'asset'
export type KnowledgeItemStatus = 'active' | 'archived'
export type KnowledgeConstraintLevel = 'required' | 'recommended' | 'optional'

export type KnowledgeItemDocument = KnowledgeItem &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class KnowledgeItem {
  @Prop({ type: Types.ObjectId, ref: 'Knowledge', required: true, index: true })
  knowledgeId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Enterprise', required: true, index: true })
  enterpriseId!: Types.ObjectId

  @Prop({ required: true })
  title!: string

  @Prop({ required: true })
  content!: string

  @Prop({ type: [String], default: [] })
  tags!: string[]

  @Prop({ type: String, enum: ['manual', 'asset'], default: 'manual' })
  sourceType!: KnowledgeItemSourceType

  @Prop({ type: Types.ObjectId, ref: 'Asset', index: true })
  assetId?: Types.ObjectId

  @Prop({ type: String, enum: ['active', 'archived'], default: 'active', index: true })
  status!: KnowledgeItemStatus

  @Prop({
    type: String,
    enum: ['required', 'recommended', 'optional'],
    default: 'recommended',
    index: true,
  })
  constraintLevel!: KnowledgeConstraintLevel

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  creatorId!: Types.ObjectId

  @Prop({ type: Object })
  metadata!: Record<string, unknown>
}

export const KnowledgeItemSchema = SchemaFactory.createForClass(KnowledgeItem)
KnowledgeItemSchema.index({ knowledgeId: 1, createdAt: -1 })
