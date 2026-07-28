import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { OwnerType, Visibility } from '@/common/enums'
import type { SpaceType } from '@brand-flow/contracts'

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

  @Prop({ type: Types.ObjectId, ref: 'Workflow' })
  workflowId?: Types.ObjectId

  @Prop({ required: true, index: true })
  spaceId!: string

  @Prop({ type: String, enum: ['personal', 'team', 'enterprise'], required: true })
  spaceType!: SpaceType

  @Prop()
  selectedCandidateId?: string

  @Prop({ type: Object })
  qualityReport?: Record<string, unknown>

  @Prop({ type: Object })
  nodesSnapshot?: Record<string, unknown>

  @Prop({ type: Boolean, default: false, index: true })
  isFavorite!: boolean

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId

  @Prop({ type: String, enum: OwnerType, required: true })
  ownerType!: OwnerType

  @Prop({ type: String, enum: Visibility, default: Visibility.PRIVATE })
  visibility!: Visibility

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  creatorId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Enterprise', index: true })
  enterpriseId?: Types.ObjectId

  @Prop({ type: Object })
  metadata!: Record<string, unknown>
}

export const WorkSchema = SchemaFactory.createForClass(Work)
WorkSchema.index({ workflowId: 1 }, { unique: true, sparse: true })
