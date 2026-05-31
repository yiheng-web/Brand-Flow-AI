import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, MessageEvent } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue, QueueEvents } from 'bullmq';
import { Model } from 'mongoose';
import { Observable } from 'rxjs';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants';
import {
  Workflow,
  WorkflowDocument,
  WorkflowStatus,
} from './schemas/workflow.schema';

export interface WorkflowResponse {
  id: string;
  status: WorkflowStatus;
  prompt: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  result?: Record<string, unknown>;
  errorMessage?: string;
}

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private queueEvents!: QueueEvents;

  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectQueue(WORKFLOW_QUEUE)
    private readonly workflowQueue: Queue,
  ) {}

  async onModuleInit() {
    this.queueEvents = new QueueEvents(WORKFLOW_QUEUE, {
      connection: this.workflowQueue.opts.connection,
    });
  }

  async onModuleDestroy() {
    await this.queueEvents.close();
  }

  async create(dto: CreateWorkflowDto): Promise<WorkflowResponse> {
    const workflow = await this.workflowModel.create({
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      status: 'pending',
    });

    await this.workflowQueue.add(RUN_WORKFLOW_JOB, {
      workflowId: workflow._id.toString(),
      knowledgeId: dto.knowledgeId,
    }, {
      jobId: workflow._id.toString(),
    });

    return this.toResponse(workflow);
  }

  streamWorkflow(id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: { type: 'connected', workflowId: id } });

      const onProgress = ({ jobId, data }: { jobId: string; data: any }) => {
        if (jobId === id) subscriber.next({ data: { type: 'progress', data } });
      };

      const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
        if (jobId === id) {
          subscriber.next({ data: { type: 'completed', data: returnvalue } });
          subscriber.complete();
        }
      };

      const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        if (jobId === id) {
          subscriber.next({ data: { type: 'failed', error: failedReason } });
          subscriber.complete();
        }
      };

      this.queueEvents.on('progress', onProgress);
      this.queueEvents.on('completed', onCompleted);
      this.queueEvents.on('failed', onFailed);

      return () => {
        this.queueEvents.off('progress', onProgress);
        this.queueEvents.off('completed', onCompleted);
        this.queueEvents.off('failed', onFailed);
      };
    });
  }

  private toResponse(workflow: WorkflowDocument): WorkflowResponse {
    return {
      id: workflow._id.toString(),
      status: workflow.status,
      prompt: workflow.prompt,
      spaceId: workflow.spaceId,
      createdAt: workflow.createdAt instanceof Date
        ? workflow.createdAt.toISOString()
        : String(workflow.createdAt),
      updatedAt: workflow.updatedAt instanceof Date
        ? workflow.updatedAt.toISOString()
        : String(workflow.updatedAt),
      result: workflow.result,
      errorMessage: workflow.errorMessage,
    };
  }
}
