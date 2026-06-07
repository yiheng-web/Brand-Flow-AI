import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed'
export type WorkflowSpaceType = 'personal' | 'team' | 'enterprise'
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

  @Prop({
    type: String,
    enum: ['personal', 'team', 'enterprise'],
    required: true,
    index: true,
  })
  spaceType!: WorkflowSpaceType

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerUserId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Team', index: true })
  teamId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Enterprise', index: true })
  enterpriseId?: Types.ObjectId

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Knowledge' }], default: [] })
  selectedKnowledgeBaseIds!: Types.ObjectId[]

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Knowledge' }], default: [] })
  requiredKnowledgeBaseIds!: Types.ObjectId[]

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Knowledge' }], default: [] })
  callableKnowledgeBaseIds!: Types.ObjectId[]

  @Prop({ type: Object })
  brandRulesSnapshot?: Record<string, unknown>

  @Prop({ type: Object })
  policiesSnapshot?: Record<string, unknown>

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
