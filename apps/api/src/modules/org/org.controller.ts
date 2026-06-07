import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  Put,
  Param,
  Patch,
  Delete,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgService } from './org.service'
import {
  CreateEnterpriseDto,
  CreateTeamDto,
  InviteSpaceMemberDto,
  UpdateEnterpriseBrandRulesDto,
  UpdateEnterprisePoliciesDto,
  UpdateSpaceMemberRoleDto,
} from './dto/org.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/modules/auth/guards/roles.guard'
import { Roles } from '@/modules/auth/guards/roles.decorator'
import { Role } from '@/common/enums'

@ApiTags('组织与空间 Org')
@ApiBearerAuth()
@Controller('org')
@UseGuards(JwtAuthGuard, RolesGuard) // 保护整个路由，同时启用角色守卫
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post('enterprise')
  @ApiOperation({ summary: '创建企业' })
  async createEnterprise(@Req() req: any, @Body() createDto: CreateEnterpriseDto) {
    const userId = req.user.sub
    return this.orgService.createEnterprise(userId, createDto)
  }

  @Get('enterprises')
  @ApiOperation({ summary: '获取我的企业列表' })
  async getMyEnterprises(@Req() req: any) {
    const userId = req.user.sub
    return this.orgService.getMyEnterprises(userId)
  }

  @Put('enterprise/:id/switch')
  @ApiOperation({ summary: '切换当前企业' })
  async switchEnterprise(@Req() req: any, @Param('id') enterpriseId: string) {
    const userId = req.user.sub
    return this.orgService.switchEnterprise(userId, enterpriseId)
  }

  @Post('team')
  @Roles(Role.OWNER, Role.ADMIN) // 仅 OWNER 和 ADMIN 角色可以创建团队
  @ApiOperation({ summary: '创建团队' })
  async createTeam(@Req() req: any, @Body() createDto: CreateTeamDto) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.orgService.createTeam(userId, enterpriseId, createDto)
  }

  @Get('teams')
  @ApiOperation({ summary: '获取当前企业团队列表' })
  async getTeams(@Req() req: any) {
    const enterpriseId = req.user.entId
    return this.orgService.getTeams(enterpriseId)
  }

  @Get('spaces')
  @ApiOperation({ summary: '获取当前用户可访问空间' })
  async getMySpaces(@Req() req: any) {
    const userId = req.user.sub
    return this.orgService.getMySpaces(userId)
  }

  @Get('spaces/:spaceId/members')
  @ApiOperation({ summary: '获取空间成员列表' })
  async getSpaceMembers(@Req() req: any, @Param('spaceId') spaceId: string) {
    const userId = req.user.sub
    return this.orgService.getSpaceMembers(userId, spaceId)
  }

  @Get('spaces/:spaceId/context')
  @ApiOperation({ summary: '获取空间上下文与权限' })
  async getSpaceContext(@Req() req: any, @Param('spaceId') spaceId: string) {
    const userId = req.user.sub
    return this.orgService.getSpaceContext(userId, spaceId)
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

  @Patch('spaces/:spaceId/members/:userId/role')
  @ApiOperation({ summary: '修改空间成员角色' })
  async updateSpaceMemberRole(
    @Req() req: any,
    @Param('spaceId') spaceId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateSpaceMemberRoleDto,
  ) {
    return this.orgService.updateSpaceMemberRole(req.user.sub, spaceId, targetUserId, dto)
  }

  @Delete('spaces/:spaceId/members/:userId')
  @ApiOperation({ summary: '移除空间成员' })
  async removeSpaceMember(
    @Req() req: any,
    @Param('spaceId') spaceId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.orgService.removeSpaceMember(req.user.sub, spaceId, targetUserId)
  }

  @Get('enterprises/:enterpriseId/brand-rules')
  @ApiOperation({ summary: '获取企业品牌规则' })
  async getEnterpriseBrandRules(@Req() req: any, @Param('enterpriseId') enterpriseId: string) {
    return this.orgService.getEnterpriseBrandRules(req.user.sub, enterpriseId)
  }

  @Patch('enterprises/:enterpriseId/brand-rules')
  @ApiOperation({ summary: '更新企业品牌规则' })
  async updateEnterpriseBrandRules(
    @Req() req: any,
    @Param('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateEnterpriseBrandRulesDto,
  ) {
    return this.orgService.updateEnterpriseBrandRules(req.user.sub, enterpriseId, dto)
  }

  @Get('enterprises/:enterpriseId/policies')
  @ApiOperation({ summary: '获取企业权限策略' })
  async getEnterprisePolicies(@Req() req: any, @Param('enterpriseId') enterpriseId: string) {
    return this.orgService.getEnterprisePolicies(req.user.sub, enterpriseId)
  }

  @Patch('enterprises/:enterpriseId/policies')
  @ApiOperation({ summary: '更新企业权限策略' })
  async updateEnterprisePolicies(
    @Req() req: any,
    @Param('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateEnterprisePoliciesDto,
  ) {
    return this.orgService.updateEnterprisePolicies(req.user.sub, enterpriseId, dto)
  }
}
