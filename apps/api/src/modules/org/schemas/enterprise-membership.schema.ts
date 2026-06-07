import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { EnterpriseRole } from '@/common/enums'

export type EnterpriseMembershipDocument = EnterpriseMembership & Document

@Schema({ timestamps: true })
export class EnterpriseMembership {
  @Prop({ type: Types.ObjectId, ref: 'Enterprise', required: true, index: true })
  enterpriseId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId

  @Prop({ type: String, enum: EnterpriseRole, default: EnterpriseRole.MEMBER })
  role!: EnterpriseRole

  @Prop({ default: 'active', index: true })
  status!: 'active' | 'invited' | 'disabled'

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId

  @Prop()
  joinedAt?: Date
}

export const EnterpriseMembershipSchema = SchemaFactory.createForClass(EnterpriseMembership)
EnterpriseMembershipSchema.index({ enterpriseId: 1, userId: 1 }, { unique: true })
