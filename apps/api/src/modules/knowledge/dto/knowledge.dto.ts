import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator'
import { Transform } from 'class-transformer'

import { KNOWLEDGE_TYPES, type KnowledgeScope, type KnowledgeType } from '@brand-flow/common'

export class KnowledgeQueryDto {
  @IsIn(['personal', 'team'])
  scope!: KnowledgeScope
}

export class CreateKnowledgeBaseDto {
  @IsIn(['personal', 'team'])
  scope!: KnowledgeScope

  @IsString()
  name!: string
}

export class ListKnowledgeQueryDto {
  @IsString()
  @IsNotEmpty()
  spaceId!: string

  @IsOptional()
  @IsIn(KNOWLEDGE_TYPES)
  type?: KnowledgeType

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  tags?: string
}

export class CreateKnowledgeDto {
  @IsString()
  @IsNotEmpty()
  spaceId!: string

  @IsIn(KNOWLEDGE_TYPES)
  type!: KnowledgeType

  @IsString()
  @IsNotEmpty()
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsObject()
  content!: Record<string, unknown>

  @IsOptional()
  @IsString()
  assetUrl?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpdateKnowledgeDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>

  @IsOptional()
  @IsString()
  assetUrl?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class SetKnowledgeEnabledDto {
  @IsBoolean()
  enabled!: boolean
}
