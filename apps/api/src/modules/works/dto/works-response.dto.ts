import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { OwnerType, Visibility } from '@/common/enums'

export class WorkVersionResponseDto {
  @ApiProperty({ description: '作品版本 ID' })
  _id!: string

  @ApiProperty({ description: '作品 ID' })
  workId!: string

  @ApiProperty({ description: '版本号', example: 1 })
  versionNo!: number

  @ApiProperty({ description: '版本图片 URL' })
  imageUrl!: string

  @ApiPropertyOptional({ description: '对象存储 key' })
  objectKey?: string

  @ApiPropertyOptional({ description: '来源工作流 ID' })
  sourceWorkflowId?: string

  @ApiPropertyOptional({ description: '节点快照' })
  nodesSnapshot?: Record<string, any>

  @ApiPropertyOptional({ description: '品牌质检报告' })
  qualityReport?: Record<string, any>

  @ApiProperty({ description: '创建者用户 ID' })
  createdBy!: string
}

export class WorkResponseDto {
  @ApiProperty({ description: '作品 ID' })
  _id!: string

  @ApiProperty({ description: '作品标题', example: '瑞幸夏季新品海报' })
  title!: string

  @ApiPropertyOptional({ description: '作品描述' })
  description?: string

  @ApiProperty({ description: '最终成品图 URL' })
  finalImageUrl!: string

  @ApiPropertyOptional({ description: '对象存储 key' })
  objectKey?: string

  @ApiPropertyOptional({ description: '来源工作流 ID' })
  workflowId?: string

  @ApiProperty({ enum: OwnerType, description: '作品归属范围' })
  ownerType!: OwnerType

  @ApiProperty({ description: '作品归属方 ID' })
  ownerId!: string

  @ApiProperty({ enum: Visibility, description: '作品可见性' })
  visibility!: Visibility

  @ApiProperty({ description: '创建者用户 ID' })
  creatorId!: string

  @ApiProperty({ description: '企业 ID' })
  workspaceId!: string

  @ApiPropertyOptional({ description: '品牌质检报告' })
  qualityReport?: Record<string, any>

  @ApiPropertyOptional({ description: '节点快照' })
  nodesSnapshot?: Record<string, any>

  @ApiPropertyOptional({ description: '扩展信息' })
  metadata?: Record<string, any>
}

export class WorkDetailResponseDto extends WorkResponseDto {
  @ApiProperty({ description: '作品版本列表', type: [WorkVersionResponseDto] })
  versions!: WorkVersionResponseDto[]
}

export class ExportWorkResponseDto {
  @ApiProperty({ description: '作品 ID' })
  workId!: string

  @ApiProperty({ description: '导出日志 ID' })
  exportLogId!: string

  @ApiProperty({ description: '导出格式', example: 'png' })
  format!: 'png'

  @ApiProperty({ description: '导出文件名', example: '瑞幸夏季新品海报.png' })
  fileName!: string

  @ApiProperty({ description: '下载地址。若作品存在 objectKey，返回短期 signedUrl' })
  downloadUrl!: string
}
