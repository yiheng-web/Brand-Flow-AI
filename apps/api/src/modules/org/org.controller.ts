import { Controller, Post, Get, Body, Req, UseGuards, Put, Param } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgService } from './org.service'
import { CreateWorkspaceDto, CreateTeamDto, InviteSpaceMemberDto } from './dto/org.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@ApiTags('组织与空间 Org')
@Controller('org')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(
    private readonly orgService: OrgService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('workspace')
  @ApiOperation({ summary: '创建企业' })
  async createWorkspace(@Req() req: any, @Body() createDto: CreateWorkspaceDto) {
    const userId = req.user.sub
    return this.orgService.createWorkspace(userId, createDto)
  }

  @Get('workspaces')
  @ApiOperation({ summary: '获取我的企业列表' })
  async getMyWorkspaces(@Req() req: any) {
    const userId = req.user.sub
    return this.orgService.getMyWorkspaces(userId)
  }

  @Put('workspace/:id/switch')
  @ApiOperation({ summary: '切换当前企业' })
  async switchWorkspace(@Req() req: any, @Param('id') workspaceId: string) {
    const userId = req.user.sub
    const result = await this.orgService.switchWorkspace(userId, workspaceId)
    const payload = {
      sub: userId,
      email: req.user.email,
      workspaceId,
      role: result.role,
    }

    return {
      ...result,
      access_token: this.jwtService.sign(payload),
    }
  }

  @Post('team')
  @ApiOperation({ summary: '创建团队' })
  async createTeam(@Req() req: any, @Body() createDto: CreateTeamDto) {
    const userId = req.user.sub
    const workspaceId = req.user.workspaceId
    return this.orgService.createTeam(userId, workspaceId, createDto)
  }

  @Get('teams')
  @ApiOperation({ summary: '获取当前企业团队列表' })
  async getTeams(@Req() req: any) {
    const workspaceId = req.user.workspaceId
    return this.orgService.getTeams(workspaceId)
  }

  @Get('spaces')
  @ApiOperation({ summary: '获取当前用户可访问空间' })
  async getMySpaces(@Req() req: any) {
    const userId = req.user.sub
    const workspaceId = req.user.workspaceId
    return this.orgService.getMySpaces(userId, workspaceId)
  }

  @Get('spaces/:spaceId/members')
  @ApiOperation({ summary: '获取空间成员列表' })
  async getSpaceMembers(@Req() req: any, @Param('spaceId') spaceId: string) {
    const userId = req.user.sub
    return this.orgService.getSpaceMembers(userId, spaceId)
  }

  @Post('spaces/:spaceId/invitations')
  @ApiOperation({ summary: '邀请空间成员' })
  async inviteSpaceMember(
    @Req() req: any,
    @Param('spaceId') spaceId: string,
    @Body() inviteDto: InviteSpaceMemberDto,
  ) {
    const userId = req.user.sub
    return this.orgService.inviteSpaceMember(userId, spaceId, inviteDto)
  }
}
