import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'
import { OwnerType, Visibility } from '@/common/enums'

export class CreateAssetDto {
  @ApiProperty({ description: '资产名称，用于资产列表和知识沉淀展示', example: '品牌 Logo 主标' })
  @IsNotEmpty({ message: '资产名称不能为空' })
  name!: string

  @ApiProperty({
    description: '资产类型，如 logo、product、reference、background、generated',
    example: 'logo',
  })
  @IsNotEmpty({ message: '资产类型不能为空' })
  type!: string

  @ApiProperty({
    description: '资产文件或外部资源地址',
    example: 'https://cdn.example.com/assets/logo.png',
  })
  @IsNotEmpty({ message: '资产地址/内容不能为空' })
  url!: string

  @ApiProperty({
    description:
      '资产归属方 ID。ownerType=user 时为用户 ID，team 时为团队 ID，enterprise 时为企业 ID',
  })
  @IsNotEmpty({ message: '归属方 ID 不能为空' })
  ownerId!: string

  @ApiProperty({ enum: OwnerType, description: '资产归属范围' })
  @IsEnum(OwnerType, { message: '不正确的归属类型' })
  ownerType!: OwnerType

  @ApiProperty({ enum: Visibility, description: '资产可见性，决定谁能在素材库中看到该资产' })
  @IsEnum(Visibility, { message: '不正确的可见性级别' })
  visibility!: Visibility

  @ApiPropertyOptional({
    description: '资产扩展信息，如 tags、description、sourceWorkflowId、尺寸等',
    example: { tags: ['logo', 'brand'], description: '品牌官方主 Logo' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UploadAssetDto {
  @ApiProperty({ description: '上传后创建的资产名称', example: '夏季活动背景图' })
  @IsNotEmpty({ message: '资产名称不能为空' })
  name!: string

  @ApiProperty({
    description: '资产类型，如 logo、product、reference、background、generated',
    example: 'background',
  })
  @IsNotEmpty({ message: '资产类型不能为空' })
  type!: string

  @ApiProperty({
    description:
      '资产归属方 ID。ownerType=user 时为用户 ID，team 时为团队 ID，enterprise 时为企业 ID',
  })
  @IsNotEmpty({ message: '归属方 ID 不能为空' })
  ownerId!: string

  @ApiProperty({ enum: OwnerType, description: '资产归属范围' })
  @IsEnum(OwnerType, { message: '不正确的归属类型' })
  ownerType!: OwnerType

  @ApiProperty({ enum: Visibility, description: '资产可见性，决定谁能访问该上传素材' })
  @IsEnum(Visibility, { message: '不正确的可见性级别' })
  visibility!: Visibility

  @ApiPropertyOptional({
    description: '逗号分隔标签，上传接口使用 multipart/form-data 字符串传入',
    example: '海报,夏季,背景',
  })
  @IsOptional()
  @IsString()
  tags?: string

  @ApiPropertyOptional({
    description: '素材描述，会进入 metadata，也可用于后续沉淀知识库',
    example: '适合夏季促销海报的蓝绿色背景',
  })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({
    description: 'JSON 字符串形式的扩展信息，上传接口使用 multipart/form-data 字符串传入',
    example: '{"source":"designer-upload","width":1024,"height":1024}',
  })
  @IsOptional()
  @IsString()
  metadata?: string
}

export class SaveAssetToKnowledgeDto {
  @ApiProperty({ description: '目标知识库 ID，素材会被创建为该知识库下的 KnowledgeItem' })
  @IsNotEmpty({ message: '知识库 ID 不能为空' })
  knowledgeId!: string

  @ApiPropertyOptional({
    description: '保存到知识库时使用的补充描述；不传则优先使用素材 metadata.description',
  })
  @IsOptional()
  @IsString()
  description?: string
}
