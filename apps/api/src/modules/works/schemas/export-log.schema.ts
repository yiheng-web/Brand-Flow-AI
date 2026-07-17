import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ExportLogDocument = ExportLog &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class ExportLog {
  @Prop({ type: Types.ObjectId, ref: 'Work', required: true, index: true })
  workId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Enterprise', index: true })
  enterpriseId?: Types.ObjectId

  @Prop({ required: true, index: true })
  spaceId!: string

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  exportedBy!: Types.ObjectId

  @Prop({ required: true })
  format!: string

  @Prop({ required: true })
  fileName!: string

  @Prop({ required: true })
  downloadUrl!: string

  @Prop({ type: Object })
  metadata!: Record<string, any>
}

export const ExportLogSchema = SchemaFactory.createForClass(ExportLog)
