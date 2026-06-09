import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type AuditLogDocument = AuditLog &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actorUserId!: Types.ObjectId

  @Prop({ required: true, index: true })
  action!: string

  @Prop({ required: true, index: true })
  targetType!: string

  @Prop({ type: Types.ObjectId, index: true })
  targetId?: Types.ObjectId

  @Prop()
  ip?: string

  @Prop()
  userAgent?: string

  @Prop({ type: Object })
  metadata?: Record<string, unknown>
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog)

AuditLogSchema.index({ workspaceId: 1, createdAt: -1 })
AuditLogSchema.index({ actorUserId: 1, createdAt: -1 })
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })
