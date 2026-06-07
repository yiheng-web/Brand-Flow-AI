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

  @Prop({
    type: Object,
    default: {
      standardColors: [],
      bannedColors: [],
      bannedStyles: [],
    },
  })
  brandRules!: {
    requiredLogo?: string
    standardColors?: string[]
    bannedColors?: string[]
    bannedStyles?: string[]
    brandVoice?: string
    minExportScore?: number
  }

  @Prop({
    type: Object,
    default: {
      requireEnterpriseKnowledgeBase: false,
      allowPersonalKnowledgeInEnterpriseCreation: true,
      teamKnowledgeRequiresReview: false,
      worksDefaultToEnterprise: false,
      memberCanExport: true,
      allowExternalAssets: true,
      allowExternalModels: true,
      allowLowScoreExport: true,
    },
  })
  policies!: {
    requireEnterpriseKnowledgeBase: boolean
    allowPersonalKnowledgeInEnterpriseCreation: boolean
    teamKnowledgeRequiresReview: boolean
    worksDefaultToEnterprise: boolean
    memberCanExport: boolean
    allowExternalAssets: boolean
    allowExternalModels: boolean
    allowLowScoreExport: boolean
  }
}

export const EnterpriseSchema = SchemaFactory.createForClass(Enterprise)
