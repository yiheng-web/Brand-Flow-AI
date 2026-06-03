import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { KnowledgeService } from './knowledge.service'
import {
  CreateKnowledgeDto,
  CreateKnowledgeItemDto,
  IngestKnowledgeDto,
  UpdateKnowledgeDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@ApiTags('知识库 Knowledge')
@ApiBearerAuth()
@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  @ApiOperation({ summary: '创建知识库' })
  async create(@Req() req: any, @Body() createDto: CreateKnowledgeDto) {
    return this.knowledgeService.create(req.user.sub, req.user.entId, createDto)
  }

  @Get()
  @ApiOperation({ summary: '获取知识库列表' })
  async findAll(@Req() req: any) {
    return this.knowledgeService.findAll(req.user.entId)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取知识库详情' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.findOne(req.user.entId, id)
  }

  @Put(':id')
  @ApiOperation({ summary: '更新知识库' })
  async update(@Req() req: any, @Param('id') id: string, @Body() updateDto: UpdateKnowledgeDto) {
    return this.knowledgeService.update(req.user.sub, req.user.entId, id, updateDto)
  }

  @Post(':id/ingest')
  @ApiOperation({ summary: '将文本写入知识库向量索引' })
  async ingest(@Req() req: any, @Param('id') id: string, @Body() ingestDto: IngestKnowledgeDto) {
    return this.knowledgeService.ingestText(req.user.sub, req.user.entId, id, ingestDto.content)
  }

  @Post(':id/items')
  @ApiOperation({ summary: '创建知识项' })
  async createItem(@Req() req: any, @Param('id') id: string, @Body() dto: CreateKnowledgeItemDto) {
    return this.knowledgeService.createItem(req.user.sub, req.user.entId, id, dto)
  }

  @Get(':id/items')
  @ApiOperation({ summary: '获取知识项列表' })
  async findItems(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.findItems(req.user.entId, id)
  }

  @Get(':id/items/:itemId')
  @ApiOperation({ summary: '获取知识项详情' })
  async findItem(@Req() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.knowledgeService.findItem(req.user.entId, id, itemId)
  }

  @Put(':id/items/:itemId')
  @ApiOperation({ summary: '更新知识项' })
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateKnowledgeItemDto,
  ) {
    return this.knowledgeService.updateItem(req.user.sub, req.user.entId, id, itemId, dto)
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: '删除知识项' })
  async removeItem(@Req() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.knowledgeService.removeItem(req.user.sub, req.user.entId, id, itemId)
  }

  @Get(':id/records')
  @ApiOperation({ summary: '获取知识库底层向量记录' })
  async getRecords(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.getRecords(req.user.entId, id)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除知识库' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.remove(req.user.sub, req.user.entId, id)
  }
}
