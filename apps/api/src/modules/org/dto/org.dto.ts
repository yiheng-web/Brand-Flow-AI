import { IsEmail, IsEnum, IsNotEmpty, IsOptional, MaxLength, IsUrl } from 'class-validator'
import { Role } from '@/common/enums'

export class CreateWorkspaceDto {
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
