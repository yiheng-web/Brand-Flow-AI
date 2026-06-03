import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { RegisterDto, LoginDto } from './dto/auth.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@ApiTags('身份鉴权 Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录用户信息' })
  getProfile(@Req() req: any) {
    return req.user
  }

  @Post('register')
  @ApiOperation({ summary: '注册账号' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto)
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '登录并获取 JWT' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto)
  }
}
