import {
  Body,
  Controller,
  Get,
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
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import {
  CreatePlacementPlanDto,
  SaveCompositionDto,
  SelectArtTextCandidateDto,
} from './dto/composition.dto'
import { WorkflowResponse, WorkflowService } from './workflow.service'
import { Observable } from 'rxjs'

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
@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('create')
  @ApiOperation({ summary: '创建并启动工作流' })
  create(
    @Body() dto: CreateWorkflowDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkflowResponse> {
    return this.workflowService.create(dto, req.user.sub)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取工作流详情' })
  getWorkflowDetail(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.getWorkflowDetail(id, req.user.sub, req.user.entId)
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
    @Body() payload: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.updateNodeOutput(
      id,
      nodeType,
      payload,
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
  stream(@Param('id') id: string, @Req() req: AuthenticatedRequest): Observable<MessageEvent> {
    return this.workflowService.streamWorkflow(id, req.user.sub, req.user.entId)
  }
}
