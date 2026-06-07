import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'
import { PlatformRole } from '@/common/enums'

export type PlatformAdminDocument = PlatformAdmin & Document

@Schema({ timestamps: true })
export class PlatformAdmin {
  @Prop({ required: true, unique: true })
  email!: string

  @Prop({ required: true, select: false })
  password!: string

  @Prop()
  name?: string

  @Prop({ type: String, enum: PlatformRole, default: PlatformRole.SUPPORT })
  role!: PlatformRole

  @Prop({ type: [String], default: [] })
  permissions!: string[]

  @Prop({ default: 'active' })
  status!: 'active' | 'disabled'

  @Prop()
  lastLoginAt?: Date
}

export const PlatformAdminSchema = SchemaFactory.createForClass(PlatformAdmin)
