import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { PlatformRole } from '@/common/enums'

export type AuditLogDocument = AuditLog & Document

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'PlatformAdmin' })
  actorUserId!: Types.ObjectId

  @Prop({ required: true })
  actorEmail!: string

  @Prop({ type: String, enum: PlatformRole, required: true })
  actorRole!: PlatformRole

  @Prop({ required: true })
  action!: string

  @Prop({ required: true })
  targetType!: string

  @Prop()
  targetId?: string

  @Prop()
  targetName?: string

  @Prop({ type: Object })
  before?: Record<string, unknown>

  @Prop({ type: Object })
  after?: Record<string, unknown>

  @Prop()
  ip?: string

  @Prop()
  userAgent?: string
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog)
