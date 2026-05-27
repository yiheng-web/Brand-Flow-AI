import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { Role } from '@/common/enums'

export type UserDocument = User & Document

@Schema()
class Membership {
  @Prop({ type: Types.ObjectId, ref: 'Enterprise', required: true })
  enterpriseId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Team' })
  teamId!: Types.ObjectId

  @Prop({ type: String, enum: Role, default: Role.MEMBER })
  role!: Role
}

const MembershipSchema = SchemaFactory.createForClass(Membership)

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email!: string

  @Prop({ required: true, select: false })
  password!: string

  @Prop({ type: Object })
  profile!: {
    nickname?: string
    avatar?: string
  }

  @Prop({ type: [MembershipSchema], default: [] })
  memberships!: Membership[]

  @Prop({ type: Types.ObjectId, ref: 'Enterprise' })
  currentEnterpriseId!: Types.ObjectId

  @Prop({ default: 'active' })
  status!: string
}

export const UserSchema = SchemaFactory.createForClass(User)
