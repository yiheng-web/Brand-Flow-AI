import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'

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

export class CreateTrustedWorkVersionDto {
  @ApiProperty({ description: '本人已完成且质检通过的来源工作流 ID' })
  @IsString()
  @IsNotEmpty()
  workflowId!: string
}

export class UpdateWorkFavoriteDto {
  @IsBoolean()
  isFavorite!: boolean
}
