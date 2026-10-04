import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsMongoId,
  ValidateNested,
} from 'class-validator'
import { BRAND_VISUAL_STYLES, IMAGE_ASPECT_RATIOS, REFERENCE_ROLES } from '@brand-flow/contracts'

export class WorkflowReferenceInputDto {
  @IsMongoId()
  assetId!: string
  @IsIn(REFERENCE_ROLES)
  role!: (typeof REFERENCE_ROLES)[number]
}
export class ImageGenerationConfigDto {
  @IsOptional()
  @IsIn(IMAGE_ASPECT_RATIOS)
  aspectRatio?: (typeof IMAGE_ASPECT_RATIOS)[number]
  @IsOptional()
  @IsInt()
  @Min(512)
  @Max(2048)
  width?: number
  @IsOptional()
  @IsInt()
  @Min(512)
  @Max(2048)
  height?: number
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999999996)
  seed?: number
}

export class BrandRequirementInputDto {
  @IsString()
  @IsNotEmpty()
  brandName!: string

  @IsString()
  @IsNotEmpty()
  productCategory!: string

  @IsString()
  @IsNotEmpty()
  productDescription!: string

  @IsString()
  @IsNotEmpty()
  targetAudience!: string

  @IsString()
  @IsNotEmpty()
  usageScenario!: string

  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(BRAND_VISUAL_STYLES, { each: true })
  visualStyles!: Array<(typeof BRAND_VISUAL_STYLES)[number]>

  @IsOptional()
  @IsString()
  colorPreference?: string

  @IsIn(IMAGE_ASPECT_RATIOS)
  aspectRatio!: (typeof IMAGE_ASPECT_RATIOS)[number]
}

export class CreateWorkflowDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => WorkflowReferenceInputDto)
  references?: WorkflowReferenceInputDto[]

  @IsOptional()
  @ValidateNested()
  @Type(() => ImageGenerationConfigDto)
  generationConfig?: ImageGenerationConfigDto
  @IsString({ message: '创意描述必须是字符串' })
  @IsNotEmpty({ message: '创意描述不能为空' })
  prompt!: string

  @IsString({ message: '空间 ID 必须是字符串' })
  @IsNotEmpty({ message: '空间 ID 不能为空' })
  spaceId!: string

  @IsOptional()
  @IsArray({ message: '知识库 ID 列表必须是数组' })
  @ArrayMaxSize(3, { message: '一次最多选择 3 个知识库' })
  @IsString({ each: true, message: '知识库 ID 必须是字符串' })
  selectedKnowledgeBaseIds?: string[]

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandRequirementInputDto)
  requirements?: BrandRequirementInputDto
}

export class StartWorkflowDto {
  @IsBoolean({ message: '图文分离选项必须是布尔值' })
  needsComposition!: boolean
}
