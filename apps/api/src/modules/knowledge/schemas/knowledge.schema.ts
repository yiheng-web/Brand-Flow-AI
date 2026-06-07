import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type KnowledgeScope = 'personal' | 'team' | 'enterprise'
export type KnowledgeVisibility = 'private' | 'team' | 'enterprise'
export type KnowledgeDocument = Knowledge & Document

@Schema({ timestamps: true })
export class Knowledge {
  @Prop({ required: true })
  name!: string

  @Prop()
  description!: string

  @Prop({
    type: String,
    enum: ['personal', 'team', 'enterprise'],
    default: 'enterprise',
    index: true,
  })
  scope!: KnowledgeScope

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
  visibility!: KnowledgeVisibility

  @Prop({ default: 0 })
  itemCount!: number

  @Prop({ default: 0 })
  storageUsed!: number

  @Prop({ default: false, index: true })
  isRequired!: boolean

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId!: Types.ObjectId

  // 预留对接向量检索空间标识
  @Prop()
  pineconeNamespace!: string
}

export const KnowledgeSchema = SchemaFactory.createForClass(Knowledge)
KnowledgeSchema.index({ scope: 1, ownerUserId: 1, createdAt: -1 })
KnowledgeSchema.index({ scope: 1, teamId: 1, createdAt: -1 })
KnowledgeSchema.index({ scope: 1, enterpriseId: 1, createdAt: -1 })
