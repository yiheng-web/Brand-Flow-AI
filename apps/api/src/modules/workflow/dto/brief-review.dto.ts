import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator'
import type { CreativeBrief, OptimizationCategory } from '@brand-flow/contracts'

export class UpdateBriefDto implements CreativeBrief {
  @IsString()
  @IsNotEmpty()
  originalRequest!: string

  @IsString()
  @IsNotEmpty()
  normalizedIntent!: string

  @IsOptional()
  @IsString()
  targetAudience?: string

  @IsOptional()
  @IsString()
  channel?: string

  @IsIn(['pure_image', 'graphic_design', 'scene_text', 'both'])
  outputMode!: CreativeBrief['outputMode']

  @IsBoolean()
  needsComposition!: boolean

  @IsOptional()
  @IsObject()
  textIntent?: CreativeBrief['textIntent']

  @IsArray()
  @IsString({ each: true })
  constraints!: string[]

  @IsArray()
  @IsString({ each: true })
  assumptions!: string[]
}

export class OptimizeWorkflowDto {
  @IsArray()
  @IsIn(['style', 'color', 'subject', 'composition', 'text'], { each: true })
  categories!: OptimizationCategory[]

  @IsString()
  @IsNotEmpty()
  instruction!: string

  @IsString()
  @IsNotEmpty()
  sourceCandidateId!: string
}
