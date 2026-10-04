import {
  Body,
  Controller,
  Get,
  Query,
  Param,
  Post,
  Put,
  UseGuards,
  Sse,
  MessageEvent,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CreateArtTextCandidatesDto } from './dto/create-art-text-candidates.dto'
import { CreateWorkflowDto, StartWorkflowDto } from './dto/create-workflow.dto'
import { OptimizeWorkflowDto, UpdateBriefDto } from './dto/brief-review.dto'
import {
  CreatePlacementPlanDto,
  SaveCompositionDto,
  SelectArtTextCandidateDto,
} from './dto/composition.dto'
import { WorkflowResponse, WorkflowService } from './workflow.service'
import { Observable } from 'rxjs'
import { ListWorkflowsDto } from './dto/list-workflows.dto'
import { SelectNodeOutputDto } from './dto/select-node-output.dto'

interface AuthenticatedRequest {
  user: { sub: string; entId?: string }
}

interface UploadedCompositionFile {
  buffer?: Buffer
  mimetype?: string
  size?: number
}

@ApiTags('智能工作流 Workflow')
@ApiBearerAuth()
@Controller(['workflow', 'workflows'])
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  @ApiOperation({ summary: '查询当前用户当前空间的创作任务历史' })
  list(@Query() query: ListWorkflowsDto, @Req() req: AuthenticatedRequest) {
    return this.workflowService.listWorkflows(query, req.user.sub)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消任务并阻止旧版本写回' })
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.cancel(id, req.user.sub, req.user.entId)
  }

  @Post(':id/retry')
  @ApiOperation({ summary: '从失败节点安全重试任务' })
  retry(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.retry(id, req.user.sub, req.user.entId)
  }

  @Post('create')
  @ApiOperation({ summary: '创建待启动工作流' })
  create(
    @Body() dto: CreateWorkflowDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowResponse> {
    return this.workflowService.create(dto, req.user.sub)
  }

  @Post(':id/start')
  @ApiOperation({ summary: '确认图文分离设置并启动工作流' })
  start(
    @Param('id') id: string,
    @Body() dto: StartWorkflowDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowResponse> {
    return this.workflowService.start(id, dto, req.user.sub, req.user.entId)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取工作流详情' })
  getWorkflowDetail(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.getWorkflowDetail(id, req.user.sub, req.user.entId)
  }

  @Post(':id/brief/confirm')
  @ApiOperation({ summary: '确认当前视觉 Brief 并继续工作流' })
  confirmBrief(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.confirmBrief(id, req.user.sub, req.user.entId)
  }

  @Put(':id/brief')
  @ApiOperation({ summary: '修改并确认视觉 Brief' })
  updateBrief(
    @Param('id') id: string,
    @Body() dto: UpdateBriefDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.updateBrief(id, dto, req.user.sub, req.user.entId)
  }

  @Post(':id/brief/regenerate')
  @ApiOperation({ summary: '重新生成视觉 Brief' })
  regenerateBrief(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.regenerateBrief(id, req.user.sub, req.user.entId)
  }

  @Post(':id/optimize')
  @ApiOperation({ summary: '根据用户反馈修订 Prompt 并生成新一轮候选图' })
  optimize(
    @Param('id') id: string,
    @Body() dto: OptimizeWorkflowDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.optimize(id, dto, req.user.sub, req.user.entId)
  }

  @Get(':id/revisions')
  @ApiOperation({ summary: '查询工作流优化历史' })
  getRevisions(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.getRevisions(id, req.user.sub, req.user.entId)
  }

  @Post(':id/result/download')
  @ApiOperation({ summary: '获取当前可信结果的短时下载地址' })
  getResultDownload(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.getResultDownload(id, req.user.sub, req.user.entId)
  }

  @Post(':id/candidates/:candidateId/download')
  @ApiOperation({ summary: '下载当前预览候选图，不要求最终候选已选择' })
  getCandidateDownload(
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.getCandidateDownload(id, candidateId, req.user.sub, req.user.entId)
  }

  @Post(':id/composition/art-text/candidates')
  @ApiOperation({ summary: '生成图文合成节点的 4 个艺术字候选' })
  generateArtTextCandidates(
    @Param('id') id: string,
    @Body() dto: CreateArtTextCandidatesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.generateArtTextCandidates(id, dto, req.user.sub, req.user.entId)
  }

  @Post(':id/composition/art-text/select')
  @ApiOperation({ summary: '保存用户选中的艺术字候选' })
  selectArtTextCandidate(
    @Param('id') id: string,
    @Body() dto: SelectArtTextCandidateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.selectArtTextCandidate(id, dto, req.user.sub, req.user.entId)
  }

  @Post(':id/composition/placement-plan')
  @ApiOperation({ summary: '根据用户框选区域计算艺术字放置方案' })
  createPlacementPlan(
    @Param('id') id: string,
    @Body() dto: CreatePlacementPlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.createPlacementPlan(id, dto, req.user.sub, req.user.entId)
  }

  @Put(':id/composition')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传 Fabric.js 确定性渲染的最终 PNG 与图层数据' })
  saveComposition(
    @Param('id') id: string,
    @Body() dto: SaveCompositionDto,
    @UploadedFile() file: UploadedCompositionFile,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.saveComposition(id, dto, file, req.user.sub, req.user.entId)
  }

  @Put(':id/nodes/:nodeType')
  @ApiOperation({ summary: '更新指定节点输出' })
  updateNodeOutput(
    @Param('id') id: string,
    @Param('nodeType') nodeType: string,
    @Body() payload: SelectNodeOutputDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.updateNodeOutput(
      id,
      nodeType,
      { ...payload },
      req.user.sub,
      req.user.entId,
    )
  }

  @Post(':id/nodes/:nodeType/run')
  @ApiOperation({ summary: '从指定节点重新运行工作流' })
  runNode(
    @Param('id') id: string,
    @Param('nodeType') nodeType: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.runNode(id, nodeType, req.user.sub, req.user.entId)
  }

  @Sse(':id/stream')
  @ApiOperation({ summary: '订阅工作流 SSE 事件流' })
  stream(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Observable<MessageEvent>> {
    return this.workflowService.streamWorkflow(id, req.user.sub, req.user.entId)
  }
}
