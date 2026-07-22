import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

export class SelectArtTextCandidateDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string
}

export class ArtTextRegionDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number

  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number

  @IsNumber()
  @Min(0.08)
  @Max(1)
  width!: number

  @IsNumber()
  @Min(0.05)
  @Max(1)
  height!: number
}

export class CreatePlacementPlanDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string

  @ValidateNested()
  @Type(() => ArtTextRegionDto)
  region!: ArtTextRegionDto
}

export class SaveCompositionDto {
  @IsString()
  @IsNotEmpty()
  baseCandidateId!: string

  @IsString()
  @IsNotEmpty()
  selectedArtTextCandidateId!: string

  @IsString()
  textContent!: string

  @IsString()
  stylePrompt!: string

  @IsString()
  placement!: string

  @IsString()
  layers!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  width!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  height!: number

  @IsIn(['png'])
  format!: 'png'
}
