import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator'

export enum KnowledgeVisibilityDto {
  PRIVATE = 'private',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
}

export enum KnowledgeItemTypeDto {
  LOGO = 'logo',
  IMAGE_ASSET = 'image_asset',
  TEXT_DOC = 'text_doc',
  PROMPT_TEMPLATE = 'prompt_template',
  NEGATIVE_RULE = 'negative_rule',
  COLOR_PALETTE = 'color_palette',
  FONT_RULE = 'font_rule',
  LAYOUT_TEMPLATE = 'layout_template',
  CASE_STUDY = 'case_study',
  BAD_CASE = 'bad_case',
}

export enum KnowledgeItemStatusDto {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export class CreateKnowledgeDto {
  @ApiProperty({ description: '知识库名称', example: '瑞幸咖啡品牌规范库' })
  @IsString()
  @IsNotEmpty()
  name!: string

  @ApiPropertyOptional({
    description: '知识库描述',
    example: '包含品牌色、Logo 使用规范、禁用词和参考案例',
  })
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional({
    description:
      '创作空间 ID。personal 表示个人空间；团队/企业空间使用对应 ObjectId。不传则兼容旧逻辑使用当前企业。',
    example: 'personal',
  })
  @IsString()
  @IsOptional()
  spaceId?: string

  @ApiPropertyOptional({
    description: '知识库可见范围。不传时后端按空间类型默认设置。',
    enum: KnowledgeVisibilityDto,
  })
  @IsEnum(KnowledgeVisibilityDto)
  @IsOptional()
  visibility?: KnowledgeVisibilityDto

  @ApiPropertyOptional({ description: '是否为强制知识库', example: false })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean

  @ApiPropertyOptional({ description: 'Pinecone 命名空间，通常由系统默认使用知识库 ID 管理' })
  @IsString()
  @IsOptional()
  pineconeNamespace?: string
}

export class UpdateKnowledgeDto {
  @ApiPropertyOptional({ description: '知识库名称', example: '瑞幸咖啡品牌规范库' })
  @IsString()
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ description: '知识库描述' })
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional({
    description: '知识库可见范围',
    enum: KnowledgeVisibilityDto,
  })
  @IsEnum(KnowledgeVisibilityDto)
  @IsOptional()
  visibility?: KnowledgeVisibilityDto

  @ApiPropertyOptional({ description: '是否为强制知识库' })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean

  @ApiPropertyOptional({ description: 'Pinecone 命名空间' })
  @IsString()
  @IsOptional()
  pineconeNamespace?: string
}

export class IngestKnowledgeDto {
  @ApiProperty({
    description: '需要切片、Embedding 并写入向量库的长文本内容',
    example: '品牌主色为绿色，禁止使用低饱和灰色作为主视觉...',
  })
  @IsString()
  @IsNotEmpty({ message: '文本内容不能为空' })
  content!: string
}

export class CreateKnowledgeItemDto {
  @ApiPropertyOptional({
    description: '知识项类型',
    enum: KnowledgeItemTypeDto,
    default: KnowledgeItemTypeDto.TEXT_DOC,
  })
  @IsEnum(KnowledgeItemTypeDto)
  @IsOptional()
  type?: KnowledgeItemTypeDto

  @ApiProperty({ description: '知识项标题，用于知识库详情页展示', example: '品牌色使用规范' })
  @IsString()
  @IsNotEmpty({ message: '知识项标题不能为空' })
  title!: string

  @ApiProperty({
    description: '知识项正文。创建后会同步写入向量库用于 AI 检索',
    example: '品牌主色为 #00A862，重要活动海报必须保持 Logo 清晰可见。',
  })
  @IsString()
  @IsOptional()
  content?: string

  @ApiPropertyOptional({ description: '文件 URL，适用于图片、Logo、模板等素材型知识项' })
  @IsString()
  @IsOptional()
  fileUrl?: string

  @ApiPropertyOptional({ description: '缩略图 URL' })
  @IsString()
  @IsOptional()
  thumbnailUrl?: string

  @ApiPropertyOptional({
    description: '知识项状态。不传时按空间策略默认 active。',
    enum: KnowledgeItemStatusDto,
  })
  @IsEnum(KnowledgeItemStatusDto)
  @IsOptional()
  status?: KnowledgeItemStatusDto

  @ApiPropertyOptional({
    description: '知识项标签',
    example: ['品牌色', 'Logo', '禁用项'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  tags?: string[]

  @ApiPropertyOptional({
    description: '扩展信息，如来源、业务分类、关联素材等',
    example: { source: 'manual' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>
}

export class UpdateKnowledgeItemDto {
  @ApiPropertyOptional({
    description: '知识项类型',
    enum: KnowledgeItemTypeDto,
  })
  @IsEnum(KnowledgeItemTypeDto)
  @IsOptional()
  type?: KnowledgeItemTypeDto

  @ApiPropertyOptional({ description: '知识项标题' })
  @IsString()
  @IsOptional()
  title?: string

  @ApiPropertyOptional({ description: '知识项正文；更新该字段会再次写入向量库' })
  @IsString()
  @IsOptional()
  content?: string

  @ApiPropertyOptional({ description: '文件 URL' })
  @IsString()
  @IsOptional()
  fileUrl?: string

  @ApiPropertyOptional({ description: '缩略图 URL' })
  @IsString()
  @IsOptional()
  thumbnailUrl?: string

  @ApiPropertyOptional({ description: '知识项标签', type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[]

  @ApiPropertyOptional({
    description: '知识项状态',
    enum: KnowledgeItemStatusDto,
  })
  @IsEnum(KnowledgeItemStatusDto)
  @IsOptional()
  status?: KnowledgeItemStatusDto

  @ApiPropertyOptional({ description: '拒绝原因，仅 rejected 状态使用' })
  @IsString()
  @IsOptional()
  rejectedReason?: string

  @ApiPropertyOptional({ description: '扩展信息' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>
}
