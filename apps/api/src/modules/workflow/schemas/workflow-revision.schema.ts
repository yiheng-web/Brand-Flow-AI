import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema, Types } from 'mongoose'
import type { OptimizationFeedback, PromptPlan, WorkflowResult } from '@brand-flow/contracts'

export type WorkflowRevisionDocument = WorkflowRevision &
  Document & { createdAt: Date; updatedAt: Date }

@Schema({ timestamps: true })
export class WorkflowRevision {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId!: Types.ObjectId

  @Prop({ required: true })
  round!: number

  @Prop({ type: Number, default: 0 })
  runVersion!: number

  @Prop({ type: Object, required: true })
  feedback!: OptimizationFeedback

  @Prop({ type: Object, required: true })
  previousPrompt!: PromptPlan

  @Prop({ type: Object, required: true })
  revisedPrompt!: PromptPlan

  @Prop({ type: Object, required: true })
  previousGenerate!: Record<string, unknown>

  @Prop({ type: String, enum: ['queued', 'completed', 'failed'], default: 'queued' })
  status!: 'queued' | 'completed' | 'failed'

  @Prop({ type: Object })
  result?: WorkflowResult
}

export const WorkflowRevisionSchema = SchemaFactory.createForClass(WorkflowRevision)
WorkflowRevisionSchema.index({ workflowId: 1, round: 1 }, { unique: true })
