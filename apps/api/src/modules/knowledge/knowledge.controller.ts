import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import {
  ApiCreatedSuccessResponse,
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@/common/swagger/api-success-response'
import { SuccessResultDto } from '@/common/swagger/common-response.dto'
import { KnowledgeService } from './knowledge.service'
import {
  CreateKnowledgeDto,
  CreateKnowledgeItemDto,
  IngestKnowledgeDto,
  UpdateKnowledgeDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto'
import {
  CreateKnowledgeItemResponseDto,
  KnowledgeIngestResponseDto,
  KnowledgeItemResponseDto,
  KnowledgeRecordResponseDto,
  KnowledgeResponseDto,
} from './dto/knowledge-response.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@ApiTags('知识库 Knowledge')
@ApiBearerAuth()
@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  @ApiOperation({
    summary: '创建知识库',
    description: '在当前企业下创建品牌知识库，用于存放品牌规则、禁用项、参考案例和素材知识项。',
  })
  @ApiCreatedSuccessResponse(KnowledgeResponseDto, '创建成功，返回封装后的知识库记录。')
  async create(@Req() req: any, @Body() createDto: CreateKnowledgeDto) {
    return this.knowledgeService.create(req.user.sub, req.user.workspaceId, createDto)
  }

  @Get()
  @ApiOperation({ summary: '获取知识库列表', description: '返回当前激活企业下的全部知识库。' })
  @ApiSuccessArrayResponse(KnowledgeResponseDto, '返回封装后的知识库列表。')
  async findAll(@Req() req: any) {
    return this.knowledgeService.findAll(req.user.sub, req.user.workspaceId)
  }

  @Get('selectable')
  @ApiOperation({
    summary: '获取当前创作空间可选知识库',
    description: '用于创作入口知识库下拉框。根据 spaceId 返回该空间下可用于本次创作的知识库。',
  })
  @ApiSuccessArrayResponse(KnowledgeResponseDto, '返回当前空间可选知识库列表。')
  async findSelectable(@Req() req: any, @Query('spaceId') spaceId?: string) {
    return this.knowledgeService.findSelectable(req.user.sub, req.user.workspaceId, spaceId)
  }

  @Get(':id')
  @ApiOperation({
    summary: '获取知识库详情',
    description: '根据知识库 ID 获取当前企业下可访问的知识库详情。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessResponse(KnowledgeResponseDto, '返回封装后的知识库详情。')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.findOne(req.user.sub, req.user.workspaceId, id)
  }

  @Put(':id')
  @ApiOperation({
    summary: '更新知识库',
    description: '更新知识库名称、描述或 Pinecone 命名空间。非创建者需要企业 OWNER/ADMIN 权限。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessResponse(KnowledgeResponseDto, '更新成功，返回封装后的知识库记录。')
  async update(@Req() req: any, @Param('id') id: string, @Body() updateDto: UpdateKnowledgeDto) {
    return this.knowledgeService.update(req.user.sub, req.user.workspaceId, id, updateDto)
  }

  @Post(':id/ingest')
  @ApiOperation({
    summary: '将文本写入知识库向量索引',
    description: '把长文本切片、Embedding 后写入 Pinecone。适合快速导入品牌规范全文。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiCreatedSuccessResponse(KnowledgeIngestResponseDto, '入库成功，返回封装后的切片数量。')
  async ingest(@Req() req: any, @Param('id') id: string, @Body() ingestDto: IngestKnowledgeDto) {
    return this.knowledgeService.ingestText(
      req.user.sub,
      req.user.workspaceId,
      id,
      ingestDto.content,
    )
  }

  @Post(':id/items')
  @ApiOperation({
    summary: '创建知识项',
    description:
      '创建结构化 KnowledgeItem，并同步将 content 写入向量库。适合知识库详情页人工维护。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiCreatedSuccessResponse(
    CreateKnowledgeItemResponseDto,
    '创建成功，返回封装后的知识项和向量入库结果。',
  )
  async createItem(@Req() req: any, @Param('id') id: string, @Body() dto: CreateKnowledgeItemDto) {
    return this.knowledgeService.createItem(req.user.sub, req.user.workspaceId, id, dto)
  }

  @Get(':id/items')
  @ApiOperation({
    summary: '获取知识项列表',
    description: '返回指定知识库下的全部 KnowledgeItem。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessArrayResponse(KnowledgeItemResponseDto, '返回封装后的知识项列表。')
  async findItems(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.findItems(req.user.sub, req.user.workspaceId, id)
  }

  @Get(':id/items/:itemId')
  @ApiOperation({
    summary: '获取知识项详情',
    description: '获取指定知识库下单条 KnowledgeItem 的详情。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiParam({ name: 'itemId', description: '知识项 ID' })
  @ApiSuccessResponse(KnowledgeItemResponseDto, '返回封装后的知识项详情。')
  async findItem(@Req() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.knowledgeService.findItem(req.user.sub, req.user.workspaceId, id, itemId)
  }

  @Put(':id/items/:itemId')
  @ApiOperation({
    summary: '更新知识项',
    description: '更新 KnowledgeItem。若更新 content，会重新写入向量库；旧向量清理仍属于后续增强。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiParam({ name: 'itemId', description: '知识项 ID' })
  @ApiSuccessResponse(KnowledgeItemResponseDto, '更新成功，返回封装后的知识项。')
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateKnowledgeItemDto,
  ) {
    return this.knowledgeService.updateItem(req.user.sub, req.user.workspaceId, id, itemId, dto)
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({
    summary: '删除知识项',
    description: '删除 KnowledgeItem 的 MongoDB 记录。底层向量清理仍属于后续增强。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiParam({ name: 'itemId', description: '知识项 ID' })
  @ApiSuccessResponse(SuccessResultDto, '删除成功，返回封装后的 success=true。')
  async removeItem(@Req() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.knowledgeService.removeItem(req.user.sub, req.user.workspaceId, id, itemId)
  }

  @Get(':id/records')
  @ApiOperation({
    summary: '获取知识库底层向量记录',
    description: '诊断接口：读取 Pinecone 中该知识库 namespace 下的向量切片记录。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessArrayResponse(KnowledgeRecordResponseDto, '返回封装后的底层向量记录列表。')
  async getRecords(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.getRecords(req.user.sub, req.user.workspaceId, id)
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除知识库',
    description: '删除知识库及 MongoDB 中的知识项。Pinecone namespace 清理仍属于后续增强。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessResponse(SuccessResultDto, '删除成功，返回封装后的 success=true。')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.remove(req.user.sub, req.user.workspaceId, id)
  }
}
