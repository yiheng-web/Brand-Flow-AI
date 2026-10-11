import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { TasksService } from './tasks.service'
import { TasksExecutionService } from './tasks-execution.service'
import { SubmissionsService } from './submissions.service'
import { ReviewTaskDto, SubmitTaskDto } from './dto/tasks.dto'
import {
  AssignTaskDto,
  CreateTaskDto,
  DeclineTaskDto,
  ListTasksDto,
  TaskCommandDto,
  UpdateTaskDto,
} from './dto/tasks.dto'

type Request = { user: { sub: string } }
@ApiTags('任务 Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly execution: TasksExecutionService,
    private readonly submissions: SubmissionsService,
  ) {}
  @Get(':id/submissions') submissionsList(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('teamId') teamId: string,
  ) {
    return this.submissions.list(req.user.sub, id, teamId)
  }
  @Get(':id/deliverables') deliverables(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('teamId') teamId: string,
  ) {
    return this.submissions.deliverables(req.user.sub, id, teamId)
  }
  @Post(':id/submit') submit(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: SubmitTaskDto,
  ) {
    return this.submissions.submit(req.user.sub, id, dto)
  }
  @Post(':id/review') review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviewTaskDto,
  ) {
    return this.submissions.review(req.user.sub, id, dto)
  }
  @Post(':id/resume') resume(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TaskCommandDto,
  ) {
    return this.submissions.resume(req.user.sub, id, dto)
  }
  @Post(':id/start') start(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TaskCommandDto,
  ) {
    return this.execution.start(req.user.sub, id, dto)
  }
  @Get(':id/timeline') timeline(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('teamId') teamId: string,
  ) {
    return this.tasks.timeline(req.user.sub, id, teamId)
  }
  @Post() create(@Req() req: Request, @Body() dto: CreateTaskDto) {
    return this.tasks.create(req.user.sub, dto)
  }
  @Get() list(@Req() req: Request, @Query() query: ListTasksDto) {
    return this.tasks.list(req.user.sub, query)
  }
  @Get(':id') detail(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('teamId') teamId: string,
  ) {
    return this.execution.detail(req.user.sub, id, teamId)
  }
  @Patch(':id') update(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(req.user.sub, id, teamId, dto)
  }
  @Delete(':id') remove(@Req() req: Request, @Param('id') id: string, @Body() dto: TaskCommandDto) {
    return this.tasks.remove(req.user.sub, id, dto)
  }
  @Post(':id/assign') assign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.tasks.command(req.user.sub, id, dto, 'assign', dto.assigneeId)
  }
  @Post(':id/accept') accept(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TaskCommandDto,
  ) {
    return this.tasks.command(req.user.sub, id, dto, 'accept')
  }
  @Post(':id/decline') decline(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: DeclineTaskDto,
  ) {
    return this.tasks.command(req.user.sub, id, dto, 'decline', undefined, dto.reason)
  }
  @Post(':id/cancel') cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TaskCommandDto,
  ) {
    return this.tasks.command(req.user.sub, id, dto, 'cancel')
  }
}
