import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongoSchema, Types } from 'mongoose'
import type { HydratedDocument } from 'mongoose'
import { TASK_STATUSES, TASK_PRIORITIES } from '@brand-flow/contracts'
import type { TaskStatus, TaskPriority, TaskRequirement } from '@brand-flow/contracts'

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true }) title!: string
  @Prop({ default: '' }) description!: string
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) enterpriseId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) teamId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) creatorId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId }) assigneeId?: Types.ObjectId
  @Prop({ type: String, enum: TASK_PRIORITIES, default: 'normal' }) priority!: TaskPriority
  @Prop({ type: Date }) deadline?: Date
  @Prop({ type: String, enum: TASK_STATUSES, default: 'draft' }) status!: TaskStatus
  @Prop({ type: Object, required: true }) requirementSnapshot!: TaskRequirement
  @Prop() activeWorkflowId?: string
  @Prop() latestSubmissionId?: string
  @Prop() declineReason?: string
  @Prop({ default: 0 }) version!: number
  createdAt!: Date
  updatedAt!: Date
}
export type TaskDocument = HydratedDocument<Task>
export const TaskSchema = SchemaFactory.createForClass(Task)
TaskSchema.index({ enterpriseId: 1, teamId: 1, status: 1, assigneeId: 1, deadline: 1 })
TaskSchema.index({ enterpriseId: 1, teamId: 1, creatorId: 1, createdAt: -1 })
