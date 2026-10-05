import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsUrl,
  IsString,
  IsMongoId,
  IsIn,
  Matches,
  ValidateIf,
} from 'class-validator'
import { PartialType, OmitType } from '@nestjs/swagger'
import { Role } from '@/common/enums'

export class CreateEnterpriseDto {
  @IsString()
  @Matches(/\S/, { message: '企业名称不能为空' })
  @IsNotEmpty({ message: '企业名称不能为空' })
  @MaxLength(50, { message: '企业名称长度不能超过 50 位' })
  name!: string

  @IsOptional()
  @IsUrl({}, { message: '请输入正确的 Logo URL 格式' })
  logo?: string
}

export class CreateTeamDto {
  @IsOptional()
  @IsMongoId()
  enterpriseId?: string

  @IsString()
  @Matches(/\S/, { message: '团队名称不能为空' })
  @IsNotEmpty({ message: '团队名称不能为空' })
  @MaxLength(50, { message: '团队名称长度不能超过 50 位' })
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '描述长度不能超过 200 位' })
  description?: string
}

export class UpdateEnterpriseDto extends PartialType(CreateEnterpriseDto, {
  skipNullProperties: false,
}) {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled'
}

export class UpdateTeamDto extends PartialType(OmitType(CreateTeamDto, ['enterpriseId'] as const), {
  skipNullProperties: false,
}) {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived'
}

export class TransferOwnerDto {
  @IsMongoId()
  targetUserId!: string
}

export class ChangeMemberRoleDto {
  @IsEnum(Role)
  role!: Role
}

export class ListInvitationsDto {
  @IsIn(['received', 'sent'])
  direction: 'received' | 'sent' = 'received'
}

export class RespondInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  inviteCode?: string
}

export class InviteSpaceMemberDto {
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  email!: string

  @IsOptional()
  @IsEnum(Role, { message: '角色不合法' })
  role?: Role
}
