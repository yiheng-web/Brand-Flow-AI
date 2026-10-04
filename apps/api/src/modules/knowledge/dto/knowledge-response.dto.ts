import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type {
  KnowledgeConstraintLevel,
  KnowledgeItemStatus,
  KnowledgeItemSourceType,
} from '@brand-flow/contracts'
import { KnowledgeImportItemDto } from './knowledge.dto'

export class KnowledgeResponseDto {
  @ApiProperty({ description: '知识库 ID' })
  _id!: string

  @ApiProperty({ description: '知识库名称', example: '瑞幸咖啡品牌规范库' })
  name!: string

  @ApiPropertyOptional({ description: '知识库描述' })
  description?: string

  @ApiPropertyOptional({ description: 'Pinecone 命名空间' })
  pineconeNamespace?: string

  @ApiProperty({ description: '创建者用户 ID' })
  creatorId!: string

  @ApiProperty({ description: '所属 Space ID' })
  spaceId!: string

  @ApiProperty({ description: '所属 Space 类型', enum: ['personal', 'team', 'enterprise'] })
  spaceType!: 'personal' | 'team' | 'enterprise'

  @ApiPropertyOptional({ description: '关联企业 ID' })
  enterpriseId?: string

  @ApiProperty({ description: '是否为企业强制知识库' })
  isRequired!: boolean
}

export class KnowledgeIngestResponseDto {
  @ApiProperty({
    description: 'Mongo 导入与向量同步提示',
    example: '已导入到知识库，语义向量未启用',
  })
  message!: string

  @ApiProperty({ description: '生成的向量切片数量', example: 3 })
  chunks!: number

  @ApiPropertyOptional({ description: '确认导入的 Mongo 条目数' })
  imported?: number

  @ApiProperty({ description: '是否已同步语义向量' })
  vectorized!: boolean

  @ApiPropertyOptional({ description: '向量同步是否失败；不影响已保存的 Mongo 知识项' })
  failed?: boolean
}

export class KnowledgeItemResponseDto {
  @ApiProperty({ description: '知识项 ID' })
  _id!: string

  @ApiProperty({ description: '知识库 ID' })
  knowledgeId!: string

  @ApiProperty({ description: '所属 Space ID' })
  spaceId!: string

  @ApiProperty({ description: '所属 Space 类型', enum: ['personal', 'team', 'enterprise'] })
  spaceType!: 'personal' | 'team' | 'enterprise'

  @ApiPropertyOptional({ description: '关联企业 ID' })
  enterpriseId?: string

  @ApiProperty({ description: '知识项标题', example: '品牌色使用规范' })
  title!: string

  @ApiProperty({ description: '知识项正文' })
  content!: string

  @ApiProperty({ description: '知识项标签', type: [String] })
  tags!: string[]

  @ApiProperty({ description: '知识项来源', enum: ['manual', 'asset', 'import'] })
  sourceType!: KnowledgeItemSourceType

  @ApiPropertyOptional({ description: '来源素材 ID' })
  assetId?: string

  @ApiProperty({ description: '知识项状态', enum: ['active', 'archived'] })
  status!: KnowledgeItemStatus

  @ApiProperty({
    description: '品牌约束级别',
    enum: ['required', 'recommended', 'optional'],
  })
  constraintLevel!: KnowledgeConstraintLevel

  @ApiProperty({ description: '创建者用户 ID' })
  creatorId!: string

  @ApiPropertyOptional({ description: '扩展信息' })
  metadata?: Record<string, unknown>
}

export class CreateKnowledgeItemResponseDto {
  @ApiProperty({ description: '创建出的知识项' })
  item!: KnowledgeItemResponseDto

  @ApiProperty({ description: '向量入库结果' })
  ingest!: KnowledgeIngestResponseDto
}

export class KnowledgeRecordResponseDto {
  @ApiProperty({ description: 'Pinecone 记录 ID' })
  id!: string

  @ApiProperty({ description: '向量记录对应的文本切片' })
  text!: string

  @ApiProperty({ description: '向量记录元数据' })
  metadata!: Record<string, unknown>
}

export class KnowledgeImportPreviewResponseDto {
  @ApiProperty({ description: '确认导入和重试时使用同一个批次 UUID' })
  batchId!: string

  @ApiProperty({ type: [KnowledgeImportItemDto] })
  items!: KnowledgeImportItemDto[]
}
