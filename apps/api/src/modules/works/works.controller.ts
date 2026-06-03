import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { CreateWorkDto, ExportWorkDto } from './dto/works.dto'
import { WorksService } from './works.service'

@Controller('works')
@UseGuards(JwtAuthGuard)
export class WorksController {
  constructor(private readonly worksService: WorksService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateWorkDto) {
    return this.worksService.create(req.user.sub, req.user.entId, dto)
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.worksService.findAll(req.user.sub, req.user.entId)
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.worksService.findOne(req.user.sub, req.user.entId, id)
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.worksService.remove(req.user.sub, req.user.entId, id)
  }

  @Post(':id/export')
  async export(@Req() req: any, @Param('id') id: string, @Body() dto: ExportWorkDto) {
    return this.worksService.export(req.user.sub, req.user.entId, id, dto)
  }
}
