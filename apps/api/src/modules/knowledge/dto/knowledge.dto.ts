import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator'

export class CreateKnowledgeDto {
  @ApiProperty({ description: '知识库所属 Space ID；个人空间固定为 personal' })
  @IsString()
  @IsNotEmpty()
  spaceId!: string

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

  @ApiPropertyOptional({ description: 'Pinecone 命名空间，通常由系统默认使用知识库 ID 管理' })
  @IsString()
  @IsOptional()
  pineconeNamespace?: string

  @ApiPropertyOptional({ description: '企业强制知识库；只允许企业空间管理员设置' })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean
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

  @ApiPropertyOptional({ description: 'Pinecone 命名空间' })
  @IsString()
  @IsOptional()
  pineconeNamespace?: string

  @ApiPropertyOptional({ description: '是否作为企业强制知识库' })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean
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
    description: '品牌约束级别：强制、推荐或可选',
    enum: ['required', 'recommended', 'optional'],
    default: 'recommended',
  })
  @IsIn(['required', 'recommended', 'optional'])
  @IsOptional()
  constraintLevel?: 'required' | 'recommended' | 'optional'

  @ApiProperty({ description: '知识项标题，用于知识库详情页展示', example: '品牌色使用规范' })
  @IsString()
  @IsNotEmpty({ message: '知识项标题不能为空' })
  title!: string

  @ApiProperty({
    description: '知识项正文。创建后会同步写入向量库用于 AI 检索',
    example: '品牌主色为 #00A862，重要活动海报必须保持 Logo 清晰可见。',
  })
  @IsString()
  @IsNotEmpty({ message: '知识项内容不能为空' })
  content!: string

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
  metadata?: Record<string, unknown>
}

export class UpdateKnowledgeItemDto {
  @ApiPropertyOptional({
    description: '品牌约束级别',
    enum: ['required', 'recommended', 'optional'],
  })
  @IsIn(['required', 'recommended', 'optional'])
  @IsOptional()
  constraintLevel?: 'required' | 'recommended' | 'optional'

  @ApiPropertyOptional({ description: '知识项标题' })
  @IsString()
  @IsOptional()
  title?: string

  @ApiPropertyOptional({ description: '知识项正文；更新该字段会再次写入向量库' })
  @IsString()
  @IsOptional()
  content?: string

  @ApiPropertyOptional({ description: '知识项标签', type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[]

  @ApiPropertyOptional({
    description: '知识项状态。active 为可用，archived 为归档',
    enum: ['active', 'archived'],
  })
  @IsString()
  @IsOptional()
  status?: 'active' | 'archived'

  @ApiPropertyOptional({ description: '扩展信息' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>
}
