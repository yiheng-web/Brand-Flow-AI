import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { OwnerType, Visibility } from '@/common/enums'

export type WorkDocument = Work &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class Work {
  @Prop({ required: true })
  title!: string

  @Prop()
  description?: string

  @Prop({ required: true })
  finalImageUrl!: string

  @Prop()
  objectKey?: string

  @Prop({ type: Types.ObjectId, ref: 'Workflow', index: true })
  workflowId?: Types.ObjectId

  @Prop({ type: Object })
  qualityReport?: Record<string, any>

  @Prop({ type: Object })
  nodesSnapshot?: Record<string, any>

  @Prop({ type: Types.ObjectId, ref: 'Space', required: true, index: true })
  spaceId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId

  @Prop({ type: String, enum: OwnerType, required: true })
  ownerType!: OwnerType

  @Prop({ type: String, enum: Visibility, default: Visibility.PRIVATE })
  visibility!: Visibility

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  creatorId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId

  @Prop({ type: Object })
  metadata!: Record<string, any>
}

export const WorkSchema = SchemaFactory.createForClass(Work)
