import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TeamDocument = Team & Document

@Schema({ timestamps: true })
export class Team {
  @Prop({ type: Types.ObjectId, ref: 'Enterprise', required: true })
  enterpriseId!: Types.ObjectId

  @Prop({ required: true })
  name!: string

  @Prop()
  description!: string
}

export const TeamSchema = SchemaFactory.createForClass(Team)
