import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { Role } from '@/common/enums'
import { MembershipScopeType } from './membership.schema'

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export type InvitationDocument = Invitation &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class Invitation {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId

  @Prop({ type: String, enum: ['workspace', 'team'], required: true, index: true })
  scopeType!: MembershipScopeType

  @Prop({ type: Types.ObjectId, required: true, index: true })
  scopeId!: Types.ObjectId

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email!: string

  @Prop({ type: String, enum: Role, default: Role.MEMBER })
  role!: Role

  @Prop({
    type: String,
    enum: ['pending', 'accepted', 'expired', 'revoked'],
    default: 'pending',
    index: true,
  })
  status!: InvitationStatus

  @Prop({ required: true, select: false })
  tokenHash!: string

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy!: Types.ObjectId

  @Prop({ required: true, index: true })
  expiresAt!: Date

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acceptedBy?: Types.ObjectId

  @Prop()
  acceptedAt?: Date

  @Prop({ type: Object })
  metadata?: Record<string, unknown>
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation)

InvitationSchema.index({ workspaceId: 1, scopeType: 1, scopeId: 1, email: 1, status: 1 })
InvitationSchema.index({ expiresAt: 1, status: 1 })
