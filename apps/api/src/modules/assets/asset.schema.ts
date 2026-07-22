import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { OwnerType, Visibility } from '@/common/enums'

export type AssetDocument = Asset & Document

@Schema({ timestamps: true })
export class Asset {
  @Prop({ required: true })
  name!: string

  @Prop({ required: true })
  type!: string

  @Prop({ required: true })
  url!: string

  @Prop()
  bucket?: string

  @Prop({ index: true })
  objectKey?: string

  @Prop()
  fileName?: string

  @Prop()
  mimeType?: string

  @Prop()
  size?: number

  @Prop()
  thumbnailObjectKey?: string

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId

  @Prop({ type: String, enum: OwnerType, required: true })
  ownerType!: OwnerType

  @Prop({ type: String, enum: Visibility, default: Visibility.PRIVATE })
  visibility!: Visibility

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId!: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Enterprise', index: true })
  enterpriseId?: Types.ObjectId

  @Prop({ type: Object })
  metadata!: Record<string, unknown>
}

export const AssetSchema = SchemaFactory.createForClass(Asset)
