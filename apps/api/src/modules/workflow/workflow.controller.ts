import { Body, Controller, Get, Param, Post, Put, UseGuards, Sse, MessageEvent } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { WorkflowResponse, WorkflowService } from './workflow.service';
import { Observable } from 'rxjs';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('create')
  create(@Body() dto: CreateWorkflowDto): Promise<WorkflowResponse> {
    return this.workflowService.create(dto);
  }

  @Get(':id')
  getWorkflowDetail(@Param('id') id: string) {
    return this.workflowService.getWorkflowDetail(id);
  }

  @Put(':id/nodes/:nodeType')
  updateNodeOutput(
    @Param('id') id: string,
    @Param('nodeType') nodeType: any,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.workflowService.updateNodeOutput(id, nodeType, payload);
  }

  @Post(':id/nodes/:nodeType/run')
  runNode(@Param('id') id: string, @Param('nodeType') nodeType: any) {
    return this.workflowService.runNode(id, nodeType);
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.workflowService.streamWorkflow(id);
  }
}
