import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { EnterpriseRole, Role, TeamRole } from '@/common/enums'

export class CreateEnterpriseDto {
  @IsNotEmpty({ message: '企业名称不能为空' })
  @MaxLength(50, { message: '企业名称长度不能超过 50 位' })
  name!: string

  @IsOptional()
  @IsUrl({}, { message: '请输入正确的 Logo URL 格式' })
  logo?: string
}

export class CreateTeamDto {
  @IsNotEmpty({ message: '团队名称不能为空' })
  @MaxLength(50, { message: '团队名称长度不能超过 50 位' })
  name!: string

  @IsOptional()
  @MaxLength(200, { message: '描述长度不能超过 200 位' })
  description?: string
}

export class InviteSpaceMemberDto {
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  email!: string

  @IsOptional()
  @IsEnum(Role, { message: '角色不合法' })
  role?: Role
}

export class UpdateEnterpriseBrandRulesDto {
  @IsOptional()
  @IsString()
  requiredLogo?: string

  @IsOptional()
  @IsArray()
  standardColors?: string[]

  @IsOptional()
  @IsArray()
  bannedColors?: string[]

  @IsOptional()
  @IsArray()
  bannedStyles?: string[]

  @IsOptional()
  @IsString()
  brandVoice?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  minExportScore?: number
}

export class UpdateEnterprisePoliciesDto {
  @IsOptional()
  @IsBoolean()
  requireEnterpriseKnowledgeBase?: boolean

  @IsOptional()
  @IsBoolean()
  allowPersonalKnowledgeInEnterpriseCreation?: boolean

  @IsOptional()
  @IsBoolean()
  teamKnowledgeRequiresReview?: boolean

  @IsOptional()
  @IsBoolean()
  worksDefaultToEnterprise?: boolean

  @IsOptional()
  @IsBoolean()
  memberCanExport?: boolean

  @IsOptional()
  @IsBoolean()
  allowExternalAssets?: boolean

  @IsOptional()
  @IsBoolean()
  allowExternalModels?: boolean

  @IsOptional()
  @IsBoolean()
  allowLowScoreExport?: boolean
}

export class UpdateSpaceMemberRoleDto {
  @IsEnum({ ...EnterpriseRole, ...TeamRole }, { message: '角色不合法' })
  role!: EnterpriseRole | TeamRole
}
