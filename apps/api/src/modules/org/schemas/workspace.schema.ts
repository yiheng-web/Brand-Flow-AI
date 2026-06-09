import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type WorkspaceDocument = Workspace & Document
export type WorkspaceType = 'personal' | 'organization'

@Schema({ timestamps: true })
export class Workspace {
  @Prop({ required: true, unique: true })
  name!: string

  @Prop({ type: String, enum: ['personal', 'organization'], required: true, index: true })
  type!: WorkspaceType

  @Prop()
  logo!: string

  @Prop({ default: 'active' })
  status!: string

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerUserId?: Types.ObjectId

  @Prop()
  billingPlan?: string

  @Prop({ type: Object })
  settings?: Record<string, unknown>
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace)
WorkspaceSchema.index({ name: 1 }, { unique: true })
WorkspaceSchema.index({ type: 1, ownerUserId: 1 })
WorkspaceSchema.index({ status: 1, updatedAt: -1 })
