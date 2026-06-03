import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Req } from '@nestjs/common'
import { KnowledgeService } from './knowledge.service'
import {
  CreateKnowledgeDto,
  CreateKnowledgeItemDto,
  IngestKnowledgeDto,
  UpdateKnowledgeDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  async create(@Req() req: any, @Body() createDto: CreateKnowledgeDto) {
    return this.knowledgeService.create(req.user.sub, req.user.entId, createDto)
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.knowledgeService.findAll(req.user.entId)
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.findOne(req.user.entId, id)
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() updateDto: UpdateKnowledgeDto) {
    return this.knowledgeService.update(req.user.sub, req.user.entId, id, updateDto)
  }

  @Post(':id/ingest')
  async ingest(@Req() req: any, @Param('id') id: string, @Body() ingestDto: IngestKnowledgeDto) {
    return this.knowledgeService.ingestText(req.user.sub, req.user.entId, id, ingestDto.content)
  }

  @Post(':id/items')
  async createItem(@Req() req: any, @Param('id') id: string, @Body() dto: CreateKnowledgeItemDto) {
    return this.knowledgeService.createItem(req.user.sub, req.user.entId, id, dto)
  }

  @Get(':id/items')
  async findItems(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.findItems(req.user.entId, id)
  }

  @Get(':id/items/:itemId')
  async findItem(@Req() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.knowledgeService.findItem(req.user.entId, id, itemId)
  }

  @Put(':id/items/:itemId')
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateKnowledgeItemDto,
  ) {
    return this.knowledgeService.updateItem(req.user.sub, req.user.entId, id, itemId, dto)
  }

  @Delete(':id/items/:itemId')
  async removeItem(@Req() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.knowledgeService.removeItem(req.user.sub, req.user.entId, id, itemId)
  }

  @Get(':id/records')
  async getRecords(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.getRecords(req.user.entId, id)
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.knowledgeService.remove(req.user.sub, req.user.entId, id)
  }
}
