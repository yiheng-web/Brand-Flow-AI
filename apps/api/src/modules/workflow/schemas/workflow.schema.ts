import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'
import { OwnerType, Visibility } from '@/common/enums'

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed'
export type WorkflowDocument = Workflow &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class Workflow {
  @Prop({ required: true })
  prompt!: string

  @Prop({ required: true, index: true })
  spaceId!: string

  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  workspaceId!: string

  @Prop({ required: true, enum: ['personal', 'organization', 'team'], index: true })
  spaceType!: 'personal' | 'organization' | 'team'

  @Prop({ required: true, enum: OwnerType, index: true })
  ownerType!: OwnerType

  @Prop({ required: true, index: true })
  ownerId!: string

  @Prop({ required: true, enum: Visibility })
  visibility!: Visibility

  @Prop({ type: [String], default: [] })
  knowledgeIds!: string[]

  @Prop({
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true,
  })
  status!: WorkflowStatus

  @Prop({ type: Object })
  result?: Record<string, unknown>

  @Prop()
  errorMessage?: string
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow)
