import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { OwnerType, Visibility } from '@/common/enums'

export type KnowledgeDocument = Knowledge & Document

@Schema({ timestamps: true })
export class Knowledge {
  @Prop({ required: true })
  name!: string

  @Prop()
  description!: string

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Space', required: true, index: true })
  spaceId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId

  @Prop({ type: String, enum: OwnerType, required: true, index: true })
  ownerType!: OwnerType

  @Prop({ type: String, enum: Visibility, required: true, index: true })
  visibility!: Visibility

  @Prop({
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
    required: true,
    index: true,
  })
  status!: 'active' | 'archived'

  // 预留对接向量检索空间标识
  @Prop()
  pineconeNamespace!: string
}

export const KnowledgeSchema = SchemaFactory.createForClass(Knowledge)
KnowledgeSchema.index({ workspaceId: 1, spaceId: 1, createdAt: -1 })
KnowledgeSchema.index({ workspaceId: 1, ownerType: 1, ownerId: 1, createdAt: -1 })
