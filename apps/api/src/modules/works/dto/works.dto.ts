import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'
import { OwnerType, Visibility } from '@/common/enums'

export class CreateWorkDto {
  @IsNotEmpty({ message: '作品标题不能为空' })
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsNotEmpty({ message: '最终图片地址不能为空' })
  finalImageUrl!: string

  @IsOptional()
  @IsString()
  objectKey?: string

  @IsOptional()
  @IsString()
  workflowId?: string

  @IsNotEmpty({ message: '归属方 ID 不能为空' })
  ownerId!: string

  @IsEnum(OwnerType, { message: '不正确的归属类型' })
  ownerType!: OwnerType

  @IsEnum(Visibility, { message: '不正确的可见性级别' })
  visibility!: Visibility

  @IsOptional()
  @IsObject()
  qualityReport?: Record<string, any>

  @IsOptional()
  @IsObject()
  nodesSnapshot?: Record<string, any>

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}

export class ExportWorkDto {
  @IsOptional()
  @IsString()
  format?: 'png'
}
