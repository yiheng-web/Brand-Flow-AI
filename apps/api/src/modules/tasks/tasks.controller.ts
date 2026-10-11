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
import { TasksOperationsService } from './tasks-operations.service'
import { ReviewTaskDto, SubmitTaskDto } from './dto/tasks.dto'
import {
  AssignTaskDto,
  CreateTaskDto,
  DeclineTaskDto,
  ListTasksDto,
  TaskCommandDto,
  UpdateTaskDto,
} from './dto/tasks.dto'

import {
  ApiCreatedSuccessResponse,
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@/common/swagger/api-success-response'
import {
  TaskResponseDto,
  TaskPageResponseDto,
  SubmissionResponseDto,
  TaskDeliverableResponseDto,
  TaskDashboardResponseDto,
} from './dto/tasks-response.dto'
import {
  AuditLogResponseDto,
  MarkNotificationReadResponseDto,
} from '../org/dto/activity-response.dto'

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
    private readonly operations: TasksOperationsService,
  ) {}
  @Get('dashboard')
  @ApiSuccessResponse(TaskDashboardResponseDto)
  dashboard(@Req() req: Request, @Query('teamId') teamId: string) {
    return this.operations.dashboard(req.user.sub, teamId)
  }
  @Get(':id/submissions')
  @ApiSuccessArrayResponse(SubmissionResponseDto)
  submissionsList(@Req() req: Request, @Param('id') id: string, @Query('teamId') teamId: string) {
    return this.submissions.list(req.user.sub, id, teamId)
  }
  @Get(':id/deliverables')
  @ApiSuccessArrayResponse(TaskDeliverableResponseDto)
  deliverables(@Req() req: Request, @Param('id') id: string, @Query('teamId') teamId: string) {
    return this.submissions.deliverables(req.user.sub, id, teamId)
  }
  @Post(':id/submit')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  submit(@Req() req: Request, @Param('id') id: string, @Body() dto: SubmitTaskDto) {
    return this.submissions.submit(req.user.sub, id, dto)
  }
  @Post(':id/review')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  review(@Req() req: Request, @Param('id') id: string, @Body() dto: ReviewTaskDto) {
    return this.submissions.review(req.user.sub, id, dto)
  }
  @Post(':id/resume')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  resume(@Req() req: Request, @Param('id') id: string, @Body() dto: TaskCommandDto) {
    return this.submissions.resume(req.user.sub, id, dto)
  }
  @Post(':id/start')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  start(@Req() req: Request, @Param('id') id: string, @Body() dto: TaskCommandDto) {
    return this.execution.start(req.user.sub, id, dto)
  }
  @Get(':id/timeline')
  @ApiSuccessArrayResponse(AuditLogResponseDto)
  timeline(@Req() req: Request, @Param('id') id: string, @Query('teamId') teamId: string) {
    return this.tasks.timeline(req.user.sub, id, teamId)
  }
  @Post()
  @ApiCreatedSuccessResponse(TaskResponseDto)
  create(@Req() req: Request, @Body() dto: CreateTaskDto) {
    return this.tasks.create(req.user.sub, dto)
  }
  @Get()
  @ApiSuccessResponse(TaskPageResponseDto)
  list(@Req() req: Request, @Query() query: ListTasksDto) {
    return this.tasks.list(req.user.sub, query)
  }
  @Get(':id')
  @ApiSuccessResponse(TaskResponseDto)
  detail(@Req() req: Request, @Param('id') id: string, @Query('teamId') teamId: string) {
    return this.execution.detail(req.user.sub, id, teamId)
  }
  @Patch(':id')
  @ApiSuccessResponse(TaskResponseDto)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(req.user.sub, id, teamId, dto)
  }
  @Delete(':id')
  @ApiSuccessResponse(MarkNotificationReadResponseDto)
  remove(@Req() req: Request, @Param('id') id: string, @Body() dto: TaskCommandDto) {
    return this.tasks.remove(req.user.sub, id, dto)
  }
  @Post(':id/assign')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  assign(@Req() req: Request, @Param('id') id: string, @Body() dto: AssignTaskDto) {
    return this.tasks.command(req.user.sub, id, dto, 'assign', dto.assigneeId)
  }
  @Post(':id/accept')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  accept(@Req() req: Request, @Param('id') id: string, @Body() dto: TaskCommandDto) {
    return this.tasks.command(req.user.sub, id, dto, 'accept')
  }
  @Post(':id/decline')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  decline(@Req() req: Request, @Param('id') id: string, @Body() dto: DeclineTaskDto) {
    return this.tasks.command(req.user.sub, id, dto, 'decline', undefined, dto.reason)
  }
  @Post(':id/cancel')
  @ApiCreatedSuccessResponse(TaskResponseDto)
  cancel(@Req() req: Request, @Param('id') id: string, @Body() dto: TaskCommandDto) {
    return this.tasks.command(req.user.sub, id, dto, 'cancel')
  }
}
