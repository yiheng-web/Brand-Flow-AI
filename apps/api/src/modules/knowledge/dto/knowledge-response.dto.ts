import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class KnowledgeResponseDto {
  @ApiProperty({ description: '知识库 ID' })
  _id!: string

  @ApiProperty({ description: '知识库名称', example: '瑞幸咖啡品牌规范库' })
  name!: string

  @ApiPropertyOptional({ description: '知识库描述' })
  description?: string

  @ApiPropertyOptional({ description: 'Pinecone 命名空间' })
  pineconeNamespace?: string

  @ApiProperty({ description: '知识库归属范围', enum: ['personal', 'team', 'enterprise'] })
  scope!: 'personal' | 'team' | 'enterprise'

  @ApiProperty({ description: '知识库可见范围', enum: ['private', 'team', 'enterprise'] })
  visibility!: 'private' | 'team' | 'enterprise'

  @ApiProperty({ description: '是否为强制知识库' })
  isRequired!: boolean

  @ApiProperty({ description: '知识项数量' })
  itemCount!: number

  @ApiProperty({ description: '已使用存储量' })
  storageUsed!: number

  @ApiPropertyOptional({ description: '个人知识库所有者用户 ID' })
  ownerUserId?: string

  @ApiPropertyOptional({ description: '团队 ID' })
  teamId?: string

  @ApiProperty({ description: '创建者用户 ID' })
  creatorId!: string

  @ApiPropertyOptional({ description: '企业 ID' })
  enterpriseId?: string
}

export class KnowledgeIngestResponseDto {
  @ApiProperty({ description: '入库提示信息', example: '成功入库，共生成 3 个向量切片' })
  message!: string

  @ApiProperty({ description: '生成的向量切片数量', example: 3 })
  chunks!: number
}

export class KnowledgeItemResponseDto {
  @ApiProperty({ description: '知识项 ID' })
  _id!: string

  @ApiProperty({ description: '知识库 ID' })
  knowledgeId!: string

  @ApiProperty({ description: '企业 ID' })
  enterpriseId?: string

  @ApiProperty({ description: '知识项归属范围', enum: ['personal', 'team', 'enterprise'] })
  scope!: 'personal' | 'team' | 'enterprise'

  @ApiPropertyOptional({ description: '个人知识项所有者用户 ID' })
  ownerUserId?: string

  @ApiPropertyOptional({ description: '团队 ID' })
  teamId?: string

  @ApiProperty({ description: '知识项可见范围', enum: ['private', 'team', 'enterprise'] })
  visibility!: 'private' | 'team' | 'enterprise'

  @ApiProperty({ description: '知识项类型' })
  type!: string

  @ApiProperty({ description: '知识项标题', example: '品牌色使用规范' })
  title!: string

  @ApiPropertyOptional({ description: '知识项正文' })
  content?: string

  @ApiPropertyOptional({ description: '文件 URL' })
  fileUrl?: string

  @ApiPropertyOptional({ description: '缩略图 URL' })
  thumbnailUrl?: string

  @ApiProperty({ description: '知识项标签', type: [String] })
  tags!: string[]

  @ApiProperty({ description: '知识项来源', enum: ['manual', 'asset'] })
  sourceType!: 'manual' | 'asset'

  @ApiPropertyOptional({ description: '来源素材 ID' })
  assetId?: string

  @ApiProperty({
    description: '知识项状态',
    enum: ['draft', 'pending_review', 'active', 'rejected', 'archived'],
  })
  status!: 'draft' | 'pending_review' | 'active' | 'rejected' | 'archived'

  @ApiProperty({ description: '创建者用户 ID' })
  creatorId!: string

  @ApiPropertyOptional({ description: '扩展信息' })
  metadata?: Record<string, any>

  @ApiPropertyOptional({ description: '审核人 ID' })
  approvedBy?: string

  @ApiPropertyOptional({ description: '拒绝原因' })
  rejectedReason?: string
}

export class CreateKnowledgeItemResponseDto {
  @ApiProperty({ description: '创建出的知识项' })
  item!: KnowledgeItemResponseDto

  @ApiPropertyOptional({ description: '向量入库结果。只有 active 且存在正文内容时返回。' })
  ingest?: KnowledgeIngestResponseDto
}

export class KnowledgeRecordResponseDto {
  @ApiProperty({ description: 'Pinecone 记录 ID' })
  id!: string

  @ApiProperty({ description: '向量记录对应的文本切片' })
  text!: string

  @ApiProperty({ description: '向量记录元数据' })
  metadata!: Record<string, any>
}
