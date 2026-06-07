import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AdminAuthService } from './admin-auth.service'
import { AdminLoginDto } from './dto/admin-auth.dto'
import { PlatformAdminGuard } from './guards/platform-admin.guard'

@ApiTags('后台管理 Admin')
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '后台管理员登录' })
  login(@Body() loginDto: AdminLoginDto) {
    return this.adminAuthService.login(loginDto)
  }

  @Get('me')
  @UseGuards(PlatformAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前后台管理员信息' })
  me(@Req() req: any) {
    return this.adminAuthService.me(req.admin)
  }

  @Post('logout')
  @UseGuards(PlatformAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '后台管理员退出登录' })
  logout() {
    return this.adminAuthService.logout()
  }
}
