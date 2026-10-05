import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types, Schema as MongooseSchema } from 'mongoose'
import { INVITATION_STATUSES, Role } from '@brand-flow/contracts'
import type { InvitationStatus } from '@brand-flow/contracts'

export type InvitationDocument = Invitation & Document

@Schema({ timestamps: true })
export class Invitation {
  @Prop({ required: true, index: true })
  spaceId!: string

  @Prop({ required: true })
  spaceName!: string

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Enterprise', required: true, index: true })
  enterpriseId!: Types.ObjectId

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team' })
  teamId?: Types.ObjectId

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  inviterId!: Types.ObjectId

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  inviteeEmail!: string

  @Prop({ enum: Role, type: String, required: true })
  targetRole!: Role

  @Prop({ required: true, select: false })
  tokenHash!: string

  @Prop({ type: String, enum: INVITATION_STATUSES, default: 'pending' })
  status!: InvitationStatus

  @Prop({ required: true })
  expiresAt!: Date
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation)
InvitationSchema.index(
  { spaceId: 1, inviteeEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
  },
)
