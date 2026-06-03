import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { CreateWorkDto, CreateWorkVersionDto, ExportWorkDto } from './dto/works.dto'
import { WorksService } from './works.service'

@ApiTags('作品 Works')
@ApiBearerAuth()
@Controller('works')
@UseGuards(JwtAuthGuard)
export class WorksController {
  constructor(private readonly worksService: WorksService) {}

  @Post()
  @ApiOperation({ summary: '保存作品' })
  async create(@Req() req: any, @Body() dto: CreateWorkDto) {
    return this.worksService.create(req.user.sub, req.user.entId, dto)
  }

  @Get()
  @ApiOperation({ summary: '获取作品列表' })
  async findAll(@Req() req: any) {
    return this.worksService.findAll(req.user.sub, req.user.entId)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取作品详情' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.worksService.findOne(req.user.sub, req.user.entId, id)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除作品' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.worksService.remove(req.user.sub, req.user.entId, id)
  }

  @Post(':id/versions')
  @ApiOperation({ summary: '新增作品版本' })
  async createVersion(@Req() req: any, @Param('id') id: string, @Body() dto: CreateWorkVersionDto) {
    return this.worksService.createVersion(req.user.sub, req.user.entId, id, dto)
  }

  @Get(':id/versions')
  @ApiOperation({ summary: '获取作品版本列表' })
  async findVersions(@Req() req: any, @Param('id') id: string) {
    return this.worksService.findVersions(req.user.sub, req.user.entId, id)
  }

  @Get(':id/versions/:versionId')
  @ApiOperation({ summary: '获取作品版本详情' })
  async findVersion(
    @Req() req: any,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.worksService.findVersion(req.user.sub, req.user.entId, id, versionId)
  }

  @Post(':id/export')
  @ApiOperation({ summary: '导出作品并记录导出日志' })
  async export(@Req() req: any, @Param('id') id: string, @Body() dto: ExportWorkDto) {
    return this.worksService.export(req.user.sub, req.user.entId, id, dto)
  }
}
