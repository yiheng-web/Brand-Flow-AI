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
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { WorkflowResponse, WorkflowService } from './workflow.service'
import { Observable } from 'rxjs'

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('create')
  create(@Body() dto: CreateWorkflowDto, @Req() req: any): Promise<WorkflowResponse> {
    return this.workflowService.create(dto, req.user?.sub, req.user?.entId)
  }

  @Get(':id')
  getWorkflowDetail(@Param('id') id: string, @Req() req: any) {
    return this.workflowService.getWorkflowDetail(id, req.user?.sub, req.user?.entId)
  }

  @Put(':id/nodes/:nodeType')
  updateNodeOutput(
    @Param('id') id: string,
    @Param('nodeType') nodeType: any,
    @Body() payload: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.workflowService.updateNodeOutput(
      id,
      nodeType,
      payload,
      req.user?.sub,
      req.user?.entId,
    )
  }

  @Post(':id/nodes/:nodeType/run')
  runNode(@Param('id') id: string, @Param('nodeType') nodeType: any, @Req() req: any) {
    return this.workflowService.runNode(id, nodeType, req.user?.sub, req.user?.entId)
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string, @Req() req: any): Observable<MessageEvent> {
    return this.workflowService.streamWorkflow(id, req.user?.sub, req.user?.entId)
  }
}
