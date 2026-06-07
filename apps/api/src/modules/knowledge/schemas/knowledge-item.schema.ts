import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type KnowledgeItemSourceType = 'manual' | 'asset'
export type KnowledgeItemType =
  | 'logo'
  | 'image_asset'
  | 'text_doc'
  | 'prompt_template'
  | 'negative_rule'
  | 'color_palette'
  | 'font_rule'
  | 'layout_template'
  | 'case_study'
  | 'bad_case'
export type KnowledgeItemStatus = 'draft' | 'pending_review' | 'active' | 'rejected' | 'archived'
export type KnowledgeItemVisibility = 'private' | 'team' | 'enterprise'
export type KnowledgeItemScope = 'personal' | 'team' | 'enterprise'

export type KnowledgeItemDocument = KnowledgeItem &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class KnowledgeItem {
  @Prop({ type: Types.ObjectId, ref: 'Knowledge', required: true, index: true })
  knowledgeId!: Types.ObjectId

  @Prop({
    type: String,
    enum: ['personal', 'team', 'enterprise'],
    default: 'enterprise',
    index: true,
  })
  scope!: KnowledgeItemScope

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerUserId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Team', index: true })
  teamId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Enterprise', index: true })
  enterpriseId?: Types.ObjectId

  @Prop({
    type: String,
    enum: ['private', 'team', 'enterprise'],
    default: 'enterprise',
    index: true,
  })
  visibility!: KnowledgeItemVisibility

  @Prop({
    type: String,
    enum: [
      'logo',
      'image_asset',
      'text_doc',
      'prompt_template',
      'negative_rule',
      'color_palette',
      'font_rule',
      'layout_template',
      'case_study',
      'bad_case',
    ],
    default: 'text_doc',
    index: true,
  })
  type!: KnowledgeItemType

  @Prop({ required: true })
  title!: string

  @Prop()
  content?: string

  @Prop()
  fileUrl?: string

  @Prop()
  thumbnailUrl?: string

  @Prop({ type: [String], default: [] })
  tags!: string[]

  @Prop({ type: String, enum: ['manual', 'asset'], default: 'manual' })
  sourceType!: KnowledgeItemSourceType

  @Prop({ type: Types.ObjectId, ref: 'Asset', index: true })
  assetId?: Types.ObjectId

  @Prop({
    type: String,
    enum: ['draft', 'pending_review', 'active', 'rejected', 'archived'],
    default: 'active',
    index: true,
  })
  status!: KnowledgeItemStatus

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  creatorId!: Types.ObjectId

  @Prop({ type: Object })
  metadata!: Record<string, any>

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId

  @Prop()
  rejectedReason?: string
}

export const KnowledgeItemSchema = SchemaFactory.createForClass(KnowledgeItem)
KnowledgeItemSchema.index({ knowledgeId: 1, createdAt: -1 })
KnowledgeItemSchema.index({ scope: 1, ownerUserId: 1, status: 1 })
KnowledgeItemSchema.index({ scope: 1, teamId: 1, status: 1 })
KnowledgeItemSchema.index({ scope: 1, enterpriseId: 1, status: 1 })
