import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Role, spacePermissions } from '@brand-flow/contracts'
import type { SpacePermissions, SpaceType } from '@brand-flow/contracts'
import { INVITATION_STATUSES } from '@brand-flow/contracts'
import type { InvitationData, InvitationStatus } from '@brand-flow/contracts'

export class OrgSpaceResponseDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  spaceId!: string

  @ApiProperty({ enum: ['personal', 'team', 'enterprise'] })
  type!: SpaceType

  @ApiProperty()
  name!: string

  @ApiProperty({ enum: Role })
  role!: Role

  @ApiPropertyOptional()
  enterpriseId?: string

  @ApiPropertyOptional()
  teamId?: string

  @ApiProperty({
    type: Object,
    description: '后端计算的资源、成员、组织管理与所有权转移权限',
    example: spacePermissions('enterprise', Role.VIEWER),
  })
  permissions!: SpacePermissions
}

export class InvitationResponseDto implements InvitationData {
  @ApiProperty() id!: string
  @ApiProperty() spaceId!: string
  @ApiProperty() spaceName!: string
  @ApiProperty() enterpriseId!: string
  @ApiPropertyOptional() teamId?: string
  @ApiProperty() inviterId!: string
  @ApiProperty() inviteeEmail!: string
  @ApiProperty({ enum: Role }) targetRole!: Role
  @ApiProperty({ enum: INVITATION_STATUSES }) status!: InvitationStatus
  @ApiProperty({ format: 'date-time' }) expiresAt!: string
  @ApiProperty() canRespond!: boolean
  @ApiProperty() canCancel!: boolean
}

export class CreateInvitationResponseDto {
  @ApiProperty({ type: InvitationResponseDto }) invitation!: InvitationResponseDto
  @ApiProperty({ description: '仅创建响应提供原始邀请码，数据库只保存哈希' }) inviteCode!: string
}

export class EnterpriseResponseDto {
  @ApiProperty() enterpriseId!: string
  @ApiProperty() name!: string
  @ApiPropertyOptional() logo?: string
  @ApiProperty({ enum: ['active', 'disabled'] }) status!: string
  @ApiProperty({ enum: Role }) role!: Role
  @ApiProperty({ type: Object }) permissions!: SpacePermissions
}

export class TeamResponseDto {
  @ApiProperty() _id!: string
  @ApiProperty() enterpriseId!: string
  @ApiProperty() name!: string
  @ApiPropertyOptional() description?: string
  @ApiProperty({ enum: ['active', 'archived'] }) status!: string
  @ApiProperty({ enum: Role }) role!: Role
  @ApiProperty({ type: Object }) permissions!: SpacePermissions
}
