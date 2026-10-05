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
  Delete,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgService } from './org.service'
import {
  CreateEnterpriseDto,
  CreateTeamDto,
  InviteSpaceMemberDto,
  UpdateEnterpriseDto,
  UpdateTeamDto,
  TransferOwnerDto,
  ChangeMemberRoleDto,
  ListInvitationsDto,
  RespondInvitationDto,
} from './dto/org.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/modules/auth/guards/roles.guard'
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
  ApiCreatedSuccessResponse,
} from '@/common/swagger/api-success-response'
import {
  OrgSpaceResponseDto,
  InvitationResponseDto,
  CreateInvitationResponseDto,
  EnterpriseResponseDto,
  TeamResponseDto,
} from './dto/org-response.dto'

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

  @ApiSuccessArrayResponse(EnterpriseResponseDto)
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
  @ApiOperation({ summary: '创建团队' })
  async createTeam(
    @Req() req: { user: { sub: string; entId?: string } },
    @Body() createDto: CreateTeamDto,
  ) {
    const userId = req.user.sub
    const enterpriseId = createDto.enterpriseId ?? req.user.entId
    if (!enterpriseId) throw new BadRequestException('请先选择企业')
    return this.orgService.createTeam(userId, enterpriseId, createDto)
  }

  @ApiSuccessArrayResponse(TeamResponseDto)
  @Get('teams')
  @ApiOperation({ summary: '获取当前企业团队列表' })
  async getTeams(
    @Req() req: { user: { sub: string; entId?: string } },
    @Query('enterpriseId') requestedId?: string,
  ) {
    const enterpriseId = requestedId ?? req.user.entId
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

  @ApiCreatedSuccessResponse(CreateInvitationResponseDto)
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

  @ApiSuccessResponse(EnterpriseResponseDto)
  @Get('enterprise/:id')
  @ApiOperation({ summary: '查看企业详情（包括停用企业）' })
  getEnterprise(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.orgService.getEnterprise(req.user.sub, id)
  }

  @Put('enterprise/:id')
  @ApiOperation({ summary: '编辑、停用或恢复企业' })
  updateEnterprise(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: UpdateEnterpriseDto,
  ) {
    return this.orgService.updateEnterprise(req.user.sub, id, dto)
  }

  @Put('enterprise/:id/owner')
  @ApiOperation({ summary: '转移企业所有权，原 OWNER 降为 ADMIN' })
  transferOwner(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: TransferOwnerDto,
  ) {
    return this.orgService.memberships.transferOwner(req.user.sub, id, dto.targetUserId)
  }

  @ApiSuccessResponse(TeamResponseDto)
  @Get('team/:id')
  @ApiOperation({ summary: '查看团队详情' })
  getTeam(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.orgService.getTeam(req.user.sub, id)
  }

  @Put('team/:id')
  @ApiOperation({ summary: '编辑、归档或恢复团队' })
  updateTeam(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.orgService.updateTeam(req.user.sub, id, dto)
  }

  @Delete('team/:id')
  @ApiOperation({ summary: '软删除团队，保留资源与成员关系' })
  archiveTeam(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.orgService.updateTeam(req.user.sub, id, { status: 'archived' })
  }

  @Put('spaces/:spaceId/members/:userId')
  @ApiOperation({ summary: '修改成员角色' })
  changeRole(
    @Req() req: { user: { sub: string } },
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
    @Body() dto: ChangeMemberRoleDto,
  ) {
    return this.orgService.memberships.changeRole(req.user.sub, spaceId, userId, dto.role)
  }

  @Delete('spaces/:spaceId/members/:userId')
  @ApiOperation({ summary: '移除成员；移出企业同时移出其团队' })
  removeMember(
    @Req() req: { user: { sub: string } },
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.orgService.memberships.remove(req.user.sub, spaceId, userId)
  }

  @Post('spaces/:spaceId/leave')
  @ApiOperation({ summary: '退出空间，OWNER 必须先转移所有权' })
  leave(@Req() req: { user: { sub: string } }, @Param('spaceId') spaceId: string) {
    return this.orgService.memberships.remove(req.user.sub, spaceId, req.user.sub, true)
  }

  @ApiSuccessArrayResponse(InvitationResponseDto)
  @Get('invitations')
  @ApiOperation({ summary: '列出收到或发出的邀请' })
  invitations(@Req() req: { user: { sub: string } }, @Query() query: ListInvitationsDto) {
    return this.orgService.invitations.list(req.user.sub, query.direction)
  }

  @ApiCreatedSuccessResponse(InvitationResponseDto)
  @Post('invitations/:id/accept')
  @ApiOperation({ summary: '接受邀请并原子加入空间' })
  accept(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: RespondInvitationDto,
  ) {
    return this.orgService.invitations.respond(req.user.sub, id, 'accepted', dto.inviteCode)
  }

  @ApiCreatedSuccessResponse(InvitationResponseDto)
  @Post('invitations/:id/reject')
  @ApiOperation({ summary: '拒绝本人邮箱收到的邀请' })
  reject(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: RespondInvitationDto,
  ) {
    return this.orgService.invitations.respond(req.user.sub, id, 'rejected', dto.inviteCode)
  }

  @ApiCreatedSuccessResponse(InvitationResponseDto)
  @Post('invitations/:id/cancel')
  @ApiOperation({ summary: '撤销本人发出的待处理邀请' })
  cancel(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.orgService.invitations.cancel(req.user.sub, id)
  }
}
