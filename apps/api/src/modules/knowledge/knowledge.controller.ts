import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'

import type { KnowledgeItem, KnowledgeOverviewDto } from '@brand-flow/common'

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

import {
  CreateKnowledgeBaseDto,
  CreateKnowledgeDto,
  KnowledgeQueryDto,
  ListKnowledgeQueryDto,
  SetKnowledgeEnabledDto,
  UpdateKnowledgeDto,
} from './dto/knowledge.dto'
import { KnowledgeService } from './knowledge.service'

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('overview')
  getOverview(@Query() query: KnowledgeQueryDto): KnowledgeOverviewDto {
    return this.knowledgeService.getOverview(query.scope ?? 'personal')
  }

  @Post('base')
  createBase(@Body() dto: CreateKnowledgeBaseDto): KnowledgeOverviewDto {
    return this.knowledgeService.createBase(dto.scope, dto.name)
  }

  @Get()
  list(@Query() query: ListKnowledgeQueryDto): Promise<KnowledgeItem[]> {
    return this.knowledgeService.list({
      spaceId: query.spaceId,
      type: query.type,
      enabled: query.enabled,
      keyword: query.keyword,
      tags: query.tags,
    })
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<KnowledgeItem> {
    return this.knowledgeService.findById(id)
  }

  @Post()
  create(@Body() dto: CreateKnowledgeDto): Promise<KnowledgeItem> {
    return this.knowledgeService.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDto): Promise<KnowledgeItem> {
    return this.knowledgeService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.knowledgeService.remove(id).then(() => ({ success: true }))
  }

  @Patch(':id/enabled')
  setEnabled(@Param('id') id: string, @Body() dto: SetKnowledgeEnabledDto): Promise<KnowledgeItem> {
    return this.knowledgeService.setEnabled(id, dto.enabled)
  }
}
