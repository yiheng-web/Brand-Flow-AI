import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
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
  KnowledgeImportPreviewResponseDto,
} from './dto/knowledge-response.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { randomUUID } from 'node:crypto'
import { ConfirmKnowledgeImportDto } from './dto/knowledge.dto'

interface AuthenticatedRequest {
  user: { sub: string }
}

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
  async create(@Req() req: AuthenticatedRequest, @Body() createDto: CreateKnowledgeDto) {
    return this.knowledgeService.create(req.user.sub, createDto)
  }

  @Get()
  @ApiOperation({ summary: '获取知识库列表', description: '返回当前激活企业下的全部知识库。' })
  @ApiSuccessArrayResponse(KnowledgeResponseDto, '返回封装后的知识库列表。')
  async findAll(@Req() req: AuthenticatedRequest, @Query('spaceId') spaceId = 'personal') {
    return this.knowledgeService.findAll(req.user.sub, spaceId)
  }

  @Get(':id')
  @ApiOperation({
    summary: '获取知识库详情',
    description: '根据知识库 ID 获取当前企业下可访问的知识库详情。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessResponse(KnowledgeResponseDto, '返回封装后的知识库详情。')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.knowledgeService.findOne(req.user.sub, id)
  }

  @Put(':id')
  @ApiOperation({
    summary: '更新知识库',
    description: '更新知识库名称、描述或 Pinecone 命名空间。非创建者需要企业 OWNER/ADMIN 权限。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessResponse(KnowledgeResponseDto, '更新成功，返回封装后的知识库记录。')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateDto: UpdateKnowledgeDto,
  ) {
    return this.knowledgeService.update(req.user.sub, id, updateDto)
  }

  @Post(':id/ingest')
  @ApiOperation({
    summary: '导入文本为 Mongo 知识项并按配置同步向量',
    description: '每个非空行作为一条规则；同一文本重复提交幂等。建议先预览再确认导入。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiCreatedSuccessResponse(
    KnowledgeIngestResponseDto,
    '入库成功，返回 Mongo 导入数量与向量同步状态。',
  )
  async ingest(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() ingestDto: IngestKnowledgeDto,
  ) {
    return this.knowledgeService.ingestText(req.user.sub, id, ingestDto.content)
  }

  @Post(':id/import/preview')
  @ApiOperation({ summary: '解析文本并预览规则，不写入数据库' })
  @ApiCreatedSuccessResponse(KnowledgeImportPreviewResponseDto)
  async previewImport(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: IngestKnowledgeDto,
  ) {
    return {
      batchId: randomUUID(),
      items: await this.knowledgeService.previewImport(req.user.sub, id, dto.content),
    }
  }

  @Post(':id/import')
  @ApiOperation({ summary: '确认预览条目并幂等导入 Mongo 知识库' })
  @ApiCreatedSuccessResponse(KnowledgeIngestResponseDto)
  async confirmImport(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ConfirmKnowledgeImportDto,
  ) {
    return this.knowledgeService.importItems(req.user.sub, id, dto.batchId, dto.items)
  }

  @Post(':id/items/:itemId/vector-sync')
  @ApiOperation({ summary: '重试知识项语义向量同步，不重复创建 Mongo 条目' })
  @ApiCreatedSuccessResponse(KnowledgeIngestResponseDto)
  async retryVectorSync(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.knowledgeService.retryVectorSync(req.user.sub, id, itemId)
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
  async createItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateKnowledgeItemDto,
  ) {
    return this.knowledgeService.createItem(req.user.sub, id, dto)
  }

  @Get(':id/items')
  @ApiOperation({
    summary: '获取知识项列表',
    description: '返回指定知识库下的全部 KnowledgeItem。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessArrayResponse(KnowledgeItemResponseDto, '返回封装后的知识项列表。')
  async findItems(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.knowledgeService.findItems(req.user.sub, id)
  }

  @Get(':id/items/:itemId')
  @ApiOperation({
    summary: '获取知识项详情',
    description: '获取指定知识库下单条 KnowledgeItem 的详情。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiParam({ name: 'itemId', description: '知识项 ID' })
  @ApiSuccessResponse(KnowledgeItemResponseDto, '返回封装后的知识项详情。')
  async findItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.knowledgeService.findItem(req.user.sub, id, itemId)
  }

  @Put(':id/items/:itemId')
  @ApiOperation({
    summary: '更新知识项',
    description:
      '更新知识项并清理旧向量；启用时按配置同步，归档时移除向量。失败保留 Mongo 并允许重试。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiParam({ name: 'itemId', description: '知识项 ID' })
  @ApiSuccessResponse(KnowledgeItemResponseDto, '更新成功，返回封装后的知识项。')
  async updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateKnowledgeItemDto,
  ) {
    return this.knowledgeService.updateItem(req.user.sub, id, itemId, dto)
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({
    summary: '删除知识项',
    description: '向量模式开启时先移除对应向量，再删除知识项；向量删除失败则保留 Mongo 条目。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiParam({ name: 'itemId', description: '知识项 ID' })
  @ApiSuccessResponse(SuccessResultDto, '删除成功，返回封装后的 success=true。')
  async removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.knowledgeService.removeItem(req.user.sub, id, itemId)
  }

  @Get(':id/records')
  @ApiOperation({
    summary: '获取知识库底层向量记录',
    description: '诊断接口：读取 Pinecone 中该知识库 namespace 下的向量切片记录。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessArrayResponse(KnowledgeRecordResponseDto, '返回封装后的底层向量记录列表。')
  async getRecords(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.knowledgeService.getRecords(req.user.sub, id)
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除知识库',
    description: '向量模式开启时先清理 namespace，再删除知识库及知识项。',
  })
  @ApiParam({ name: 'id', description: '知识库 ID' })
  @ApiSuccessResponse(SuccessResultDto, '删除成功，返回封装后的 success=true。')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.knowledgeService.remove(req.user.sub, id)
  }
}
