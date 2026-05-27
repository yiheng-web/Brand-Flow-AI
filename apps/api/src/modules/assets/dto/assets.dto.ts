import { IsNotEmpty, IsEnum, IsOptional, IsString, IsObject } from 'class-validator'
import { OwnerType, Visibility } from '@/common/enums'

export class CreateAssetDto {
  @IsNotEmpty({ message: '资产名称不能为空' })
  name!: string

  @IsNotEmpty({ message: '资产类型不能为空' })
  type!: string

  @IsNotEmpty({ message: '资产地址/内容不能为空' })
  url!: string

  @IsNotEmpty({ message: '归属方 ID 不能为空' })
  ownerId!: string

  @IsEnum(OwnerType, { message: '不正确的归属类型' })
  ownerType!: OwnerType

  @IsEnum(Visibility, { message: '不正确的可见性级别' })
  visibility!: Visibility

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}
