import { Body, Controller, Get, Post, Query } from '@nestjs/common'

import type { KnowledgeOverviewDto } from '@brand-flow/common'

import { CreateKnowledgeBaseDto, KnowledgeQueryDto } from './dto/knowledge.dto'
import { KnowledgeService } from './knowledge.service'

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  getOverview(@Query() query: KnowledgeQueryDto): KnowledgeOverviewDto {
    return this.knowledgeService.getOverview(query.scope ?? 'personal')
  }

  @Post()
  createBase(@Body() dto: CreateKnowledgeBaseDto): KnowledgeOverviewDto {
    return this.knowledgeService.createBase(dto.scope, dto.name)
  }
}
