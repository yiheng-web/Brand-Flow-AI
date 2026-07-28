import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'
import type {
  BrandRequirementInput,
  SpaceType,
  WorkflowAwaitingAction,
  WorkflowStatus,
} from '@brand-flow/contracts'

export type { WorkflowStatus } from '@brand-flow/contracts'
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

  @Prop({ type: String, enum: ['personal', 'team', 'enterprise'], required: true, index: true })
  spaceType!: SpaceType

  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ index: true })
  entId?: string

  @Prop({ type: [String], default: [] })
  selectedKnowledgeBaseIds!: string[]

  @Prop({ type: Object })
  requirements?: BrandRequirementInput

  @Prop({ type: Number, default: 0 })
  retryCount!: number

  @Prop({
    type: String,
    enum: ['pending', 'running', 'awaiting_user', 'completed', 'failed'],
    default: 'pending',
    index: true,
  })
  status!: WorkflowStatus

  @Prop({
    type: String,
    enum: [
      'select_direction',
      'confirm_brief',
      'select_candidate',
      'enter_art_text',
      'select_art_text',
      'select_art_text_region',
    ],
  })
  awaitingAction?: WorkflowAwaitingAction

  @Prop({ type: Object })
  result?: Record<string, unknown>

  @Prop()
  errorMessage?: string
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow)
