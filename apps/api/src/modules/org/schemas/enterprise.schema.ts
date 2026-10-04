import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type EnterpriseDocument = Enterprise & Document

@Schema({ timestamps: true })
export class Enterprise {
  @Prop({ required: true, unique: true })
  name!: string

  @Prop()
  logo!: string

  @Prop({ default: 'active' })
  status!: string
}

export const EnterpriseSchema = SchemaFactory.createForClass(Enterprise)
