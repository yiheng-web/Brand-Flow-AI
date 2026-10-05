import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Role, spacePermissions } from '@brand-flow/contracts'
import type { SpacePermissions, SpaceType } from '@brand-flow/contracts'

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
    description: '后端计算的读取、写入、成员、知识库、素材、作品与任务分配权限',
    example: spacePermissions('enterprise', Role.VIEWER),
  })
  permissions!: SpacePermissions
}
