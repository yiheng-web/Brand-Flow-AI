import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongoSchema, Types } from 'mongoose'
import type { HydratedDocument } from 'mongoose'
import { SUBMISSION_STATUSES } from '@brand-flow/contracts'
import type { SubmissionStatus } from '@brand-flow/contracts'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Submission {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  taskId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  enterpriseId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  teamId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  submitterId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  workId!: Types.ObjectId
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  workVersionId!: Types.ObjectId
  @Prop({ required: true, immutable: true }) round!: number
  @Prop({ default: '', immutable: true }) comment!: string
  @Prop({ type: String, enum: SUBMISSION_STATUSES, default: 'reviewing' }) status!: SubmissionStatus
  @Prop({ type: MongoSchema.Types.ObjectId }) reviewerId?: Types.ObjectId
  @Prop({ type: Date }) reviewedAt?: Date
  @Prop() reviewComment?: string
  createdAt!: Date
}
export type SubmissionDocument = HydratedDocument<Submission>
export const SubmissionSchema = SchemaFactory.createForClass(Submission)
SubmissionSchema.index({ taskId: 1, round: 1 }, { unique: true })
SubmissionSchema.index({ enterpriseId: 1, teamId: 1, status: 1, createdAt: -1 })
