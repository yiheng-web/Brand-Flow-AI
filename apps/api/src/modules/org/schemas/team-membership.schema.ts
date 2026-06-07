import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { TeamRole } from '@/common/enums'

export type TeamMembershipDocument = TeamMembership & Document

@Schema({ timestamps: true })
export class TeamMembership {
  @Prop({ type: Types.ObjectId, ref: 'Enterprise', required: true, index: true })
  enterpriseId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Team', required: true, index: true })
  teamId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId

  @Prop({ type: String, enum: TeamRole, default: TeamRole.CREATOR })
  role!: TeamRole

  @Prop({ default: 'active', index: true })
  status!: 'active' | 'invited' | 'disabled'

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId

  @Prop()
  joinedAt?: Date
}

export const TeamMembershipSchema = SchemaFactory.createForClass(TeamMembership)
TeamMembershipSchema.index({ teamId: 1, userId: 1 }, { unique: true })
