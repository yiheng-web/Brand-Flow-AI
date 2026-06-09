import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type UserDocument = User & Document

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

  @Prop({ default: 'active' })
  status!: string

  @Prop()
  lastLoginAt?: Date
}

export const UserSchema = SchemaFactory.createForClass(User)
UserSchema.index({ email: 1 }, { unique: true })
UserSchema.index({ status: 1, updatedAt: -1 })
