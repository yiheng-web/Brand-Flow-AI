import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  Put,
  Param,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgService } from './org.service'
import { CreateEnterpriseDto, CreateTeamDto, InviteSpaceMemberDto } from './dto/org.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/modules/auth/guards/roles.guard'
import { Roles } from '@/modules/auth/guards/roles.decorator'
import { Role } from '@/common/enums'
import { ApiSuccessArrayResponse } from '@/common/swagger/api-success-response'
import { OrgSpaceResponseDto } from './dto/org-response.dto'

@ApiTags('组织与空间 Org')
@ApiBearerAuth()
@Controller('org')
@UseGuards(JwtAuthGuard, RolesGuard) // 保护整个路由，同时启用角色守卫
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post('enterprise')
  @ApiOperation({ summary: '创建企业' })
  async createEnterprise(
    @Req() req: { user: { sub: string; entId?: string } },
    @Body() createDto: CreateEnterpriseDto,
  ) {
    const userId = req.user.sub
    return this.orgService.createEnterprise(userId, createDto)
  }

  @Get('enterprises')
  @ApiOperation({ summary: '获取我的企业列表' })
  async getMyEnterprises(@Req() req: { user: { sub: string; entId?: string } }) {
    const userId = req.user.sub
    return this.orgService.getMyEnterprises(userId)
  }

  @Put('enterprise/:id/switch')
  @ApiOperation({ summary: '切换当前企业' })
  async switchEnterprise(
    @Req() req: { user: { sub: string; entId?: string } },
    @Param('id') enterpriseId: string,
  ) {
    const userId = req.user.sub
    return this.orgService.switchEnterprise(userId, enterpriseId)
  }

  @Post('team')
  @Roles(Role.OWNER, Role.ADMIN) // 仅 OWNER 和 ADMIN 角色可以创建团队
  @ApiOperation({ summary: '创建团队' })
  async createTeam(
    @Req() req: { user: { sub: string; entId?: string } },
    @Body() createDto: CreateTeamDto,
  ) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    if (!enterpriseId) throw new BadRequestException('请先切换企业空间')
    return this.orgService.createTeam(userId, enterpriseId, createDto)
  }

  @Get('teams')
  @ApiOperation({ summary: '获取当前企业团队列表' })
  async getTeams(@Req() req: { user: { sub: string; entId?: string } }) {
    const enterpriseId = req.user.entId
    if (!enterpriseId) throw new BadRequestException('请先切换企业空间')
    return this.orgService.getTeams(enterpriseId, req.user.sub)
  }

  @Get('spaces')
  @ApiOperation({ summary: '获取当前用户可访问空间' })
  @ApiSuccessArrayResponse(OrgSpaceResponseDto, '返回空间及服务端计算的权限结果')
  async getMySpaces(@Req() req: { user: { sub: string; entId?: string } }) {
    const userId = req.user.sub
    return this.orgService.getMySpaces(userId)
  }

  @Get('spaces/:spaceId/members')
  @ApiOperation({ summary: '获取空间成员列表' })
  async getSpaceMembers(
    @Req() req: { user: { sub: string; entId?: string } },
    @Param('spaceId') spaceId: string,
  ) {
    const userId = req.user.sub
    return this.orgService.getSpaceMembers(userId, spaceId)
  }

  @Post('spaces/:spaceId/invitations')
  @ApiOperation({ summary: '邀请空间成员' })
  async inviteSpaceMember(
    @Req() req: { user: { sub: string; entId?: string } },
    @Param('spaceId') spaceId: string,
    @Body() inviteDto: InviteSpaceMemberDto,
  ) {
    const userId = req.user.sub
    return this.orgService.inviteSpaceMember(userId, spaceId, inviteDto)
  }
}
