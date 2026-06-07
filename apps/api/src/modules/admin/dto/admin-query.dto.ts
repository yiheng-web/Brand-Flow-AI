import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class AdminListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled'
}

export class UpdateStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled'
}

export class AuditLogQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsString()
  actor?: string

  @IsOptional()
  @IsString()
  action?: string

  @IsOptional()
  @IsString()
  targetType?: string
}

export class RejectReviewItemDto {
  @IsString()
  reason!: string
}
