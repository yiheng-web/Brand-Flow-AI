import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type SpaceType = 'personal' | 'organization' | 'team'
export type SpaceStatus = 'active' | 'archived'

export type SpaceDocument = Space &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class Space {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId

  @Prop({ type: String, enum: ['personal', 'organization', 'team'], required: true, index: true })
  type!: SpaceType

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId

  @Prop({ required: true })
  name!: string

  @Prop({ type: String, enum: ['active', 'archived'], default: 'active', index: true })
  status!: SpaceStatus

  @Prop({ type: Object })
  settings?: {
    defaultKnowledgeIds?: string[]
    maxKnowledgePerWorkflow?: number
  }

  @Prop({ type: Object })
  metadata?: Record<string, unknown>
}

export const SpaceSchema = SchemaFactory.createForClass(Space)

SpaceSchema.index({ workspaceId: 1, type: 1, ownerId: 1 }, { unique: true })
SpaceSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 })
