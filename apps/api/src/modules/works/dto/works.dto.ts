import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'
import { OwnerType, Visibility } from '@/common/enums'

export class CreateWorkDto {
  @ApiProperty({ description: '作品所属 Space ID' })
  @IsString()
  @IsNotEmpty({ message: 'Space ID 不能为空' })
  spaceId!: string
  @ApiProperty({
    description: '作品标题，用于作品中心卡片和导出文件名',
    example: '瑞幸夏季新品海报',
  })
  @IsNotEmpty({ message: '作品标题不能为空' })
  title!: string

  @ApiPropertyOptional({ description: '作品描述', example: '基于夏季户外场景生成的营销海报' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({
    description: '最终成品图 URL。保存作品时必须提供',
    example: 'https://cdn.example.com/works/final.png',
  })
  @IsNotEmpty({ message: '最终图片地址不能为空' })
  finalImageUrl!: string

  @ApiPropertyOptional({
    description: '对象存储中的 object key。存在时导出接口会优先返回 signedUrl',
    example: 'works/user/123/final.png',
  })
  @IsOptional()
  @IsString()
  objectKey?: string

  @ApiProperty({ description: '来源工作流 ID；服务端据此读取可信成片与质检结果' })
  @IsNotEmpty({ message: '来源工作流 ID 不能为空' })
  @IsString()
  workflowId!: string

  @ApiProperty({
    description:
      '作品归属方 ID。ownerType=user 时为用户 ID，team 时为团队 ID，enterprise 时为企业 ID',
  })
  @IsOptional()
  ownerId?: string

  @ApiProperty({ enum: OwnerType, description: '作品归属范围' })
  @IsOptional()
  @IsEnum(OwnerType, { message: '不正确的归属类型' })
  ownerType?: OwnerType

  @ApiProperty({ enum: Visibility, description: '作品可见性，决定作品中心列表查询范围' })
  @IsOptional()
  @IsEnum(Visibility, { message: '不正确的可见性级别' })
  visibility?: Visibility

  @ApiPropertyOptional({
    description: '最终品牌质检报告，作品详情页展示',
    example: { totalScore: 8.6, issues: [] },
  })
  @IsOptional()
  @IsObject()
  qualityReport?: Record<string, unknown>

  @ApiPropertyOptional({ description: '保存作品时的工作流节点快照，用于作品详情回看生成过程' })
  @IsOptional()
  @IsObject()
  nodesSnapshot?: Record<string, unknown>

  @ApiPropertyOptional({ description: '作品扩展信息，如画布尺寸、选择的候选图 ID、导出配置等' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class ExportWorkDto {
  @ApiPropertyOptional({
    description: '导出格式。V1.0 暂仅支持 png',
    enum: ['png'],
    default: 'png',
  })
  @IsOptional()
  @IsString()
  format?: 'png'
}

export class CreateWorkVersionDto {
  @ApiProperty({
    description: '该版本对应的成品图 URL',
    example: 'https://cdn.example.com/works/final-v2.png',
  })
  @IsNotEmpty({ message: '版本图片地址不能为空' })
  imageUrl!: string

  @ApiPropertyOptional({
    description: '对象存储中的 object key。存在时可用于 signedUrl 下载',
    example: 'works/user/123/final-v2.png',
  })
  @IsOptional()
  @IsString()
  objectKey?: string

  @ApiPropertyOptional({ description: '来源工作流 ID。用于标记本版本来自哪一次重新生成或回溯优化' })
  @IsOptional()
  @IsString()
  sourceWorkflowId?: string

  @ApiPropertyOptional({ description: '该版本对应的节点快照' })
  @IsOptional()
  @IsObject()
  nodesSnapshot?: Record<string, unknown>

  @ApiPropertyOptional({
    description: '该版本对应的品牌质检报告',
    example: { totalScore: 91, issues: [] },
  })
  @IsOptional()
  @IsObject()
  qualityReport?: Record<string, unknown>
}
