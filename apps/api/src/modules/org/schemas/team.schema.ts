import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types, Schema as MongooseSchema } from 'mongoose'

export type TeamDocument = Team & Document

@Schema({ timestamps: true })
export class Team {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Enterprise', required: true })
  enterpriseId!: Types.ObjectId

  @Prop({ required: true })
  name!: string

  @Prop({ enum: ['active', 'archived'], default: 'active' })
  status!: 'active' | 'archived'

  @Prop()
  description!: string
}

export const TeamSchema = SchemaFactory.createForClass(Team)
