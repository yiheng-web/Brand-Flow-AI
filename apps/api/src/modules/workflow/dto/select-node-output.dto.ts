import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class SelectNodeOutputDto {
  @ApiPropertyOptional({ description: '已有创意方向 ID，仅 creativeDirection 节点可使用' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  selectedDirectionId?: string

  @ApiPropertyOptional({ description: '已有候选底图 ID，仅 generate 节点可使用' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  selectedCandidateId?: string
}
