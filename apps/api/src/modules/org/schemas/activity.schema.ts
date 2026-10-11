import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongooseSchema, Types } from 'mongoose'
import type { HydratedDocument } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false }, minimize: false })
export class AuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) actorId!: Types.ObjectId
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) enterpriseId!: Types.ObjectId
  @Prop({ type: MongooseSchema.Types.ObjectId }) teamId?: Types.ObjectId
  @Prop({ required: true }) action!: string
  @Prop({ required: true }) resourceType!: string
  @Prop({ required: true }) resourceId!: string
  @Prop({ type: Object, default: {} }) metadata!: Record<string, string | boolean>
  createdAt!: Date
}
export type AuditLogDocument = HydratedDocument<AuditLog>
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog)
AuditLogSchema.index({ enterpriseId: 1, teamId: 1, createdAt: -1, _id: -1 })

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Notification {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) recipientId!: Types.ObjectId
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) enterpriseId!: Types.ObjectId
  @Prop({ type: MongooseSchema.Types.ObjectId }) teamId?: Types.ObjectId
  @Prop({ required: true }) action!: string
  @Prop({ required: true }) resourceId!: string
  @Prop() readAt?: Date
  createdAt!: Date
}
export type NotificationDocument = HydratedDocument<Notification>
export const NotificationSchema = SchemaFactory.createForClass(Notification)
NotificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 })
