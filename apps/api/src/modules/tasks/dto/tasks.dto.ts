import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { TASK_PRIORITIES, TASK_STATUSES } from '@brand-flow/contracts'
import type { TaskPriority, TaskStatus } from '@brand-flow/contracts'
import { CreateWorkflowDto } from '../../workflow/dto/create-workflow.dto'
import { OmitType } from '@nestjs/swagger'

export class TaskRequirementDto extends OmitType(CreateWorkflowDto, ['spaceId'] as const) {
  @IsBoolean() needsComposition!: boolean
  @IsOptional() @IsString() @MaxLength(100) channel?: string
}
export class CreateTaskDto {
  @ApiProperty() @IsMongoId() teamId!: string
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title!: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string
  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority
  @ApiPropertyOptional() @IsOptional() @IsISO8601() deadline?: string
  @ApiProperty({ type: TaskRequirementDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => TaskRequirementDto)
  requirementSnapshot!: TaskRequirementDto
}
export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ['teamId'] as const)) {
  @ApiProperty() @IsInt() @Min(0) version!: number
}
export class TaskCommandDto {
  @ApiProperty() @IsMongoId() teamId!: string
  @ApiProperty() @IsInt() @Min(0) version!: number
}
export class AssignTaskDto extends TaskCommandDto {
  @ApiProperty() @IsMongoId() assigneeId!: string
}
export class DeclineTaskDto extends TaskCommandDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) reason!: string
}
export class ListTasksDto {
  @ApiProperty() @IsMongoId() teamId!: string
  @IsOptional() @IsIn(['mine', 'created-by-me', 'team']) view?: 'mine' | 'created-by-me' | 'team'
  @IsOptional() @IsIn(TASK_STATUSES) status?: TaskStatus
  @IsOptional() @IsIn(['overdue', 'upcoming']) deadline?: 'overdue' | 'upcoming'
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20
}
