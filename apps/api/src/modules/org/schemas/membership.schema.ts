import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { Role } from '@/common/enums'

export type MembershipScopeType = 'workspace' | 'team'
export type MembershipStatus = 'active' | 'invited' | 'disabled' | 'left'

export type MembershipDocument = Membership &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class Membership {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId

  @Prop({ type: String, enum: ['workspace', 'team'], required: true, index: true })
  scopeType!: MembershipScopeType

  @Prop({ type: Types.ObjectId, required: true, index: true })
  scopeId!: Types.ObjectId

  @Prop({ type: String, enum: Role, default: Role.MEMBER, index: true })
  role!: Role

  @Prop({
    type: String,
    enum: ['active', 'invited', 'disabled', 'left'],
    default: 'active',
    index: true,
  })
  status!: MembershipStatus

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId

  @Prop()
  joinedAt?: Date

  @Prop()
  leftAt?: Date

  @Prop({ type: Object })
  metadata?: Record<string, unknown>
}

export const MembershipSchema = SchemaFactory.createForClass(Membership)

MembershipSchema.index({ userId: 1, scopeType: 1, scopeId: 1 }, { unique: true })
MembershipSchema.index({ workspaceId: 1, scopeType: 1, scopeId: 1, status: 1 })
MembershipSchema.index({ userId: 1, workspaceId: 1, status: 1 })
