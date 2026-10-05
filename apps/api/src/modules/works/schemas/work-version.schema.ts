import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema, Types } from 'mongoose'

export type WorkVersionDocument = WorkVersion &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class WorkVersion {
  @Prop({ type: String, enum: ['personal', 'team', 'enterprise'] })
  spaceType?: 'personal' | 'team' | 'enterprise'

  @Prop({ index: true })
  spaceId?: string

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Enterprise', index: true })
  enterpriseId?: Types.ObjectId

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Work', required: true, index: true })
  workId!: Types.ObjectId

  @Prop({ required: true })
  versionNo!: number

  @Prop({ required: true })
  imageUrl!: string

  @Prop()
  objectKey?: string

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Workflow', index: true })
  sourceWorkflowId?: Types.ObjectId

  @Prop({ type: Object })
  nodesSnapshot?: Record<string, unknown>

  @Prop({ type: Object })
  qualityReport?: Record<string, unknown>

  @Prop()
  sourceObjectKey?: string

  @Prop({ type: Number })
  sourceRunVersion?: number

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WorkflowRevision' })
  sourceRevisionId?: Types.ObjectId

  @Prop({ type: Object })
  promptPlan?: Record<string, unknown>

  @Prop({ type: Object })
  feedback?: Record<string, unknown>

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy!: Types.ObjectId
}

export const WorkVersionSchema = SchemaFactory.createForClass(WorkVersion)
WorkVersionSchema.index({ workId: 1, versionNo: 1 }, { unique: true })
WorkVersionSchema.index(
  { workId: 1, sourceWorkflowId: 1, sourceObjectKey: 1 },
  { unique: true, partialFilterExpression: { sourceObjectKey: { $type: 'string' } } },
)
