import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import {
  ApiCreatedSuccessResponse,
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@/common/swagger/api-success-response'
import { SuccessResultDto } from '@/common/swagger/common-response.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import {
  CreateTrustedWorkVersionDto,
  CreateWorkDto,
  ExportWorkDto,
  UpdateWorkFavoriteDto,
} from './dto/works.dto'
import {
  ExportWorkResponseDto,
  WorkDetailResponseDto,
  WorkResponseDto,
  WorkVersionResponseDto,
} from './dto/works-response.dto'
import { WorksService } from './works.service'

interface AuthenticatedRequest {
  user: { sub: string }
}

@ApiTags('作品 Works')
@ApiBearerAuth()
@Controller('works')
@UseGuards(JwtAuthGuard)
export class WorksController {
  constructor(private readonly worksService: WorksService) {}

  @Post()
  @ApiOperation({
    summary: '保存作品',
    description:
      '把工作流最终生成结果保存为作品，并自动创建第 1 个 WorkVersion，供作品中心和作品详情展示。',
  })
  @ApiCreatedSuccessResponse(WorkDetailResponseDto, '保存成功，返回封装后的作品详情和版本列表。')
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkDto) {
    return this.worksService.create(req.user.sub, dto)
  }

  @Get()
  @ApiOperation({
    summary: '获取作品列表',
    description: '返回当前用户在指定 Space 中创建的私有作品。',
  })
  @ApiSuccessArrayResponse(WorkResponseDto, '返回封装后的作品列表。')
  async findAll(@Req() req: AuthenticatedRequest, @Query('spaceId') spaceId = 'personal') {
    return this.worksService.findAll(req.user.sub, spaceId)
  }

  @Get(':id')
  @ApiOperation({
    summary: '获取作品详情',
    description:
      '获取单个作品详情，同时返回该作品的全部 WorkVersion，用于作品详情页回看节点快照和版本记录。',
  })
  @ApiParam({ name: 'id', description: '作品 ID' })
  @ApiSuccessResponse(WorkDetailResponseDto, '返回封装后的作品详情和版本列表。')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.worksService.findOne(req.user.sub, id)
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除作品',
    description: '删除本人作品及其版本记录。',
  })
  @ApiParam({ name: 'id', description: '作品 ID' })
  @ApiSuccessResponse(SuccessResultDto, '删除成功，返回封装后的 success=true。')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.worksService.remove(req.user.sub, id)
  }

  @Post(':id/versions')
  @ApiOperation({
    summary: '新增作品版本',
    description: '仅依据本人已完成且质检通过的工作流生成版本，不接受客户端对象与质检结果。',
  })
  @ApiParam({ name: 'id', description: '作品 ID' })
  @ApiCreatedSuccessResponse(WorkVersionResponseDto, '创建成功，返回封装后的新作品版本。')
  async createVersion(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateTrustedWorkVersionDto,
  ) {
    return this.worksService.createTrustedVersion(req.user.sub, id, dto.workflowId)
  }

  @Post(':id/versions/from-workflow')
  @ApiOperation({ summary: '从已完成且质检通过的可信工作流创建作品版本' })
  async createTrustedVersion(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateTrustedWorkVersionDto,
  ) {
    return this.worksService.createTrustedVersion(req.user.sub, id, dto.workflowId)
  }

  @Post(':id/versions/:versionId/export')
  @ApiOperation({ summary: '导出本人作品的指定历史版本 PNG' })
  @ApiSuccessResponse(ExportWorkResponseDto, '返回指定版本的附件下载地址。')
  exportVersion(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: ExportWorkDto,
  ) {
    return this.worksService.export(req.user.sub, id, dto, versionId)
  }

  @Post(':id/favorite')
  @ApiOperation({ summary: '设置作品收藏状态' })
  async updateFavorite(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateWorkFavoriteDto,
  ) {
    return this.worksService.updateFavorite(req.user.sub, id, dto.isFavorite)
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: '获取作品版本列表',
    description: '返回指定作品的全部版本，按 versionNo 倒序排列。',
  })
  @ApiParam({ name: 'id', description: '作品 ID' })
  @ApiSuccessArrayResponse(WorkVersionResponseDto, '返回封装后的作品版本列表。')
  async findVersions(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.worksService.findVersions(req.user.sub, id)
  }

  @Get(':id/versions/:versionId')
  @ApiOperation({
    summary: '获取作品版本详情',
    description: '返回指定作品下单个版本的图片、节点快照和质检报告。',
  })
  @ApiParam({ name: 'id', description: '作品 ID' })
  @ApiParam({ name: 'versionId', description: '作品版本 ID' })
  @ApiSuccessResponse(WorkVersionResponseDto, '返回封装后的作品版本详情。')
  async findVersion(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.worksService.findVersion(req.user.sub, id, versionId)
  }

  @Post(':id/export')
  @ApiOperation({
    summary: '导出作品并记录导出日志',
    description: 'V1.0 暂仅支持 PNG。接口返回可下载 URL，并创建 ExportLog 记录本次导出行为。',
  })
  @ApiParam({ name: 'id', description: '作品 ID' })
  @ApiSuccessResponse(ExportWorkResponseDto, '返回封装后的导出日志 ID、文件名和下载地址。')
  async export(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ExportWorkDto,
  ) {
    return this.worksService.export(req.user.sub, id, dto)
  }
}
