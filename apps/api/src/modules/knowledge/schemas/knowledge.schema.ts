import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { SpaceType } from '@brand-flow/contracts'
import { Document, Types, Schema as MongooseSchema } from 'mongoose'

export type KnowledgeDocument = Knowledge & Document

@Schema({ timestamps: true, autoIndex: false })
export class Knowledge {
  @Prop({ required: true })
  name!: string

  @Prop()
  description!: string

  @Prop({ required: true, index: true })
  spaceId!: string

  @Prop({ type: String, enum: ['personal', 'team', 'enterprise'], required: true, index: true })
  spaceType!: SpaceType

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Enterprise', index: true })
  enterpriseId?: Types.ObjectId

  @Prop({ type: Boolean, default: false, index: true })
  isRequired!: boolean

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  creatorId!: Types.ObjectId

  // 预留对接向量检索空间标识
  @Prop()
  pineconeNamespace!: string
}

export const KnowledgeSchema = SchemaFactory.createForClass(Knowledge)
KnowledgeSchema.index(
  { spaceId: 1, creatorId: 1, name: 1 },
  {
    name: 'knowledge_personal_name_unique',
    unique: true,
    partialFilterExpression: { spaceType: 'personal' },
  },
)
KnowledgeSchema.index(
  { spaceId: 1, name: 1 },
  {
    name: 'knowledge_org_name_unique',
    unique: true,
    partialFilterExpression: { spaceType: { $in: ['team', 'enterprise'] } },
  },
)
