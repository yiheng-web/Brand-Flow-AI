import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type WorkVersionDocument = WorkVersion &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class WorkVersion {
  @Prop({ type: Types.ObjectId, ref: 'Work', required: true, index: true })
  workId!: Types.ObjectId

  @Prop({ required: true })
  versionNo!: number

  @Prop({ required: true })
  imageUrl!: string

  @Prop()
  objectKey?: string

  @Prop({ type: Types.ObjectId, ref: 'Workflow', index: true })
  sourceWorkflowId?: Types.ObjectId

  @Prop({ type: Object })
  nodesSnapshot?: Record<string, any>

  @Prop({ type: Object })
  qualityReport?: Record<string, any>

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy!: Types.ObjectId
}

export const WorkVersionSchema = SchemaFactory.createForClass(WorkVersion)
WorkVersionSchema.index({ workId: 1, versionNo: 1 }, { unique: true })
