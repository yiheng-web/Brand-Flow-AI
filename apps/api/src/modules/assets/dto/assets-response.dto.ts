import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { OwnerType, Visibility } from '@/common/enums'

export class AssetResponseDto {
  @ApiProperty({ description: '资产 ID' })
  _id!: string

  @ApiProperty({ description: '资产名称', example: '品牌 Logo 主标' })
  name!: string

  @ApiProperty({ description: '资产类型', example: 'logo' })
  type!: string

  @ApiProperty({ description: '资产访问地址' })
  url!: string

  @ApiProperty({ enum: OwnerType, description: '资产归属范围' })
  ownerType!: OwnerType

  @ApiProperty({ description: '资产归属方 ID' })
  ownerId!: string

  @ApiProperty({ enum: Visibility, description: '资产可见性' })
  visibility!: Visibility

  @ApiProperty({ description: '创建者用户 ID' })
  creatorId!: string

  @ApiProperty({ description: '企业 ID' })
  enterpriseId!: string

  @ApiPropertyOptional({ description: '对象存储 bucket' })
  bucket?: string

  @ApiPropertyOptional({ description: '对象存储 key' })
  objectKey?: string

  @ApiPropertyOptional({ description: '原始文件名' })
  fileName?: string

  @ApiPropertyOptional({ description: '文件 MIME 类型', example: 'image/png' })
  mimeType?: string

  @ApiPropertyOptional({ description: '文件大小，单位字节', example: 102400 })
  size?: number

  @ApiPropertyOptional({ description: '短期签名访问地址' })
  signedUrl?: string

  @ApiPropertyOptional({ description: '缩略图短期签名访问地址' })
  thumbnailSignedUrl?: string

  @ApiPropertyOptional({ description: '扩展信息' })
  metadata?: Record<string, unknown>
}

export class SaveAssetToKnowledgeResponseDto {
  @ApiProperty({ description: '操作是否成功', example: true })
  success!: boolean

  @ApiProperty({ description: '素材资产 ID' })
  assetId!: string

  @ApiProperty({ description: '目标知识库 ID' })
  knowledgeId!: string

  @ApiProperty({ description: '创建出的知识项' })
  item!: Record<string, unknown>

  @ApiProperty({ description: '向量入库结果' })
  ingest!: Record<string, unknown>
}
