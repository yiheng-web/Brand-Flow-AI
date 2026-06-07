import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AdminService } from './admin.service'
import { AuditLogService } from './audit-log.service'
import {
  AdminListQueryDto,
  AuditLogQueryDto,
  RejectReviewItemDto,
  UpdateStatusDto,
} from './dto/admin-query.dto'
import { PlatformAdminGuard } from './guards/platform-admin.guard'
import { PlatformPermissionGuard } from './guards/platform-permission.guard'
import { PlatformPermissions } from './decorators/platform-permissions.decorator'

@ApiTags('后台管理 Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(PlatformAdminGuard, PlatformPermissionGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('dashboard')
  @PlatformPermissions('admin.dashboard.read')
  @ApiOperation({ summary: '后台 Dashboard 汇总' })
  getDashboard() {
    return this.adminService.getDashboard()
  }

  @Get('users')
  @PlatformPermissions('admin.users.read')
  @ApiOperation({ summary: '后台用户列表' })
  listUsers(@Query() query: AdminListQueryDto) {
    return this.adminService.listUsers(query)
  }

  @Get('users/:userId')
  @PlatformPermissions('admin.users.read')
  @ApiOperation({ summary: '后台用户详情' })
  getUser(@Param('userId') userId: string) {
    return this.adminService.getUser(userId)
  }

  @Patch('users/:userId/status')
  @PlatformPermissions('admin.users.write')
  @ApiOperation({ summary: '后台修改用户状态' })
  updateUserStatus(@Req() req: any, @Param('userId') userId: string, @Body() dto: UpdateStatusDto) {
    return this.adminService.updateUserStatus(req.admin, userId, dto, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    })
  }

  @Get('enterprises')
  @PlatformPermissions('admin.enterprises.read')
  @ApiOperation({ summary: '后台企业列表' })
  listEnterprises(@Query() query: AdminListQueryDto) {
    return this.adminService.listEnterprises(query)
  }

  @Get('enterprises/:enterpriseId')
  @PlatformPermissions('admin.enterprises.read')
  @ApiOperation({ summary: '后台企业详情' })
  getEnterprise(@Param('enterpriseId') enterpriseId: string) {
    return this.adminService.getEnterprise(enterpriseId)
  }

  @Patch('enterprises/:enterpriseId/status')
  @PlatformPermissions('admin.enterprises.write')
  @ApiOperation({ summary: '后台修改企业状态' })
  updateEnterpriseStatus(
    @Req() req: any,
    @Param('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.adminService.updateEnterpriseStatus(req.admin, enterpriseId, dto, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    })
  }

  @Get('enterprises/:enterpriseId/members')
  @PlatformPermissions('admin.enterprises.read')
  @ApiOperation({ summary: '后台企业成员列表' })
  listEnterpriseMembers(
    @Param('enterpriseId') enterpriseId: string,
    @Query() query: AdminListQueryDto,
  ) {
    return this.adminService.listEnterpriseMembers(enterpriseId, query)
  }

  @Get('enterprises/:enterpriseId/teams')
  @PlatformPermissions('admin.enterprises.read')
  @ApiOperation({ summary: '后台企业团队列表' })
  listEnterpriseTeams(
    @Param('enterpriseId') enterpriseId: string,
    @Query() query: AdminListQueryDto,
  ) {
    return this.adminService.listEnterpriseTeams(enterpriseId, query)
  }

  @Get('audit-logs')
  @PlatformPermissions('admin.audit.read')
  @ApiOperation({ summary: '后台审计日志列表' })
  listAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.auditLogService.list(query)
  }

  @Get('review-queue')
  @PlatformPermissions('admin.review.read')
  @ApiOperation({ summary: '后台审核队列' })
  listReviewQueue(@Query() query: AdminListQueryDto) {
    return this.adminService.listReviewQueue(query)
  }

  @Post('review-queue/:itemId/approve')
  @PlatformPermissions('admin.review.write')
  @ApiOperation({ summary: '后台审核通过' })
  approveReviewItem(@Req() req: any, @Param('itemId') itemId: string) {
    return this.adminService.approveReviewItem(req.admin, itemId, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    })
  }

  @Post('review-queue/:itemId/reject')
  @PlatformPermissions('admin.review.write')
  @ApiOperation({ summary: '后台审核拒绝' })
  rejectReviewItem(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() dto: RejectReviewItemDto,
  ) {
    return this.adminService.rejectReviewItem(req.admin, itemId, dto.reason, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    })
  }
}
