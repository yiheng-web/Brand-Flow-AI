import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { WORKFLOW_TRANSITIONS } from '@brand-flow/contracts'
import type { WorkflowStatus } from '@brand-flow/contracts'

export class ListWorkflowsDto {
  @ApiPropertyOptional({ default: 'personal' })
  @IsString()
  spaceId = 'personal'

  @ApiPropertyOptional({ enum: Object.keys(WORKFLOW_TRANSITIONS) })
  @IsOptional()
  @IsIn(Object.keys(WORKFLOW_TRANSITIONS))
  status?: WorkflowStatus

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20
}
