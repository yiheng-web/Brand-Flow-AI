import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TeamDocument = Team & Document

@Schema({ timestamps: true })
export class Team {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId

  @Prop({ required: true })
  name!: string

  @Prop()
  description!: string

  @Prop({ type: String, enum: ['active', 'archived'], default: 'active', index: true })
  status!: 'active' | 'archived'

  @Prop({ type: Types.ObjectId, ref: 'Team', index: true })
  parentTeamId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId

  @Prop({ type: Object })
  settings?: Record<string, unknown>
}

export const TeamSchema = SchemaFactory.createForClass(Team)
TeamSchema.index({ workspaceId: 1, name: 1 }, { unique: true })
TeamSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 })
