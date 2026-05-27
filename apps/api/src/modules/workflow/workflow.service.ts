import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  MessageEvent,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { Queue, QueueEvents } from 'bullmq'
import { Model } from 'mongoose'
import { Observable } from 'rxjs'
import { CreateWorkflowDto, RerunWorkflowDto } from './dto/create-workflow.dto'
import {
  DEFAULT_NODE_STATES,
  RUN_WORKFLOW_JOB,
  WORKFLOW_NODE_IDS,
  WORKFLOW_QUEUE,
  type WorkflowNodeId,
  type WorkflowNodeStatus,
} from './workflow.constants'
import {
  Workflow,
  WorkflowDocument,
  WorkflowNodeStateMap,
  WorkflowRerunRecord,
  WorkflowSessionContext,
  WorkflowStatus,
} from './schemas/workflow.schema'

export interface WorkflowResponse {
  id: string
  status: WorkflowStatus
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: Record<string, unknown>
  sessionContext: WorkflowSessionContext
  nodeStates: Partial<WorkflowNodeStateMap>
  activeNodeId?: WorkflowNodeId
  rerunHistory: WorkflowRerunRecord[]
  errorMessage?: string
}

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private queueEvents!: QueueEvents

  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectQueue(WORKFLOW_QUEUE)
    private readonly workflowQueue: Queue,
  ) {}

  async onModuleInit() {
    this.queueEvents = new QueueEvents(WORKFLOW_QUEUE, {
      connection: this.workflowQueue.opts.connection,
    })
  }

  async onModuleDestroy() {
    await this.queueEvents.close()
  }

  async create(dto: CreateWorkflowDto): Promise<WorkflowResponse> {
    const sessionContext: WorkflowSessionContext = {
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      scope: dto.scope,
      sceneType: dto.sceneType,
      imageRatio: dto.imageRatio,
      useKnowledge: dto.useKnowledge ?? true,
      brandProfileId: dto.brandProfileId,
      imageSize: dto.imageRatio,
    }

    const workflow = await this.workflowModel.create({
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      status: 'pending',
      sessionContext,
      nodeStates: DEFAULT_NODE_STATES,
    })

    await this.workflowQueue.add(
      RUN_WORKFLOW_JOB,
      {
        workflowId: workflow._id.toString(),
      },
      {
        jobId: workflow._id.toString(),
      },
    )

    return this.toResponse(workflow)
  }

  async rerun(id: string, dto: RerunWorkflowDto): Promise<WorkflowResponse> {
    const workflow = await this.workflowModel.findById(id)

    if (!workflow) {
      throw new NotFoundException('工作流不存在')
    }

    const nodeStates = this.resetDownstreamStates(
      {
        ...DEFAULT_NODE_STATES,
        ...(workflow.nodeStates ?? {}),
      },
      dto.rerunFromNodeId,
    )

    const sessionContext = {
      ...(workflow.sessionContext ?? {}),
      ...dto.sessionContext,
      rerunFromNodeId: dto.rerunFromNodeId,
    }

    const updated = await this.workflowModel.findByIdAndUpdate(
      id,
      {
        status: 'pending',
        activeNodeId: dto.rerunFromNodeId,
        sessionContext,
        nodeStates,
        $unset: { errorMessage: 1 },
        $push: {
          rerunHistory: {
            rerunFromNodeId: dto.rerunFromNodeId,
            requestedAt: new Date().toISOString(),
          },
        },
      },
      { new: true },
    )

    await this.workflowQueue.add(
      RUN_WORKFLOW_JOB,
      {
        workflowId: id,
        rerunFromNodeId: dto.rerunFromNodeId,
      },
      {
        jobId: `${id}-rerun-${Date.now()}`,
      },
    )

    return this.toResponse(updated ?? workflow)
  }

  async getStatus(id: string): Promise<WorkflowResponse> {
    const workflow = await this.workflowModel.findById(id)

    if (!workflow) {
      throw new NotFoundException('工作流不存在')
    }

    return this.toResponse(workflow)
  }

  streamWorkflow(id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: { type: 'connected', workflowId: id } })

      const onProgress = ({ jobId, data }: { jobId: string; data: unknown }) => {
        if (jobId === id) subscriber.next({ data: { type: 'progress', data } })
      }

      const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
        if (jobId === id) {
          subscriber.next({ data: { type: 'completed', data: returnvalue } })
          subscriber.complete()
        }
      }

      const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        if (jobId === id) {
          subscriber.next({ data: { type: 'failed', error: failedReason } })
          subscriber.complete()
        }
      }

      this.queueEvents.on('progress', onProgress)
      this.queueEvents.on('completed', onCompleted)
      this.queueEvents.on('failed', onFailed)

      return () => {
        this.queueEvents.off('progress', onProgress)
        this.queueEvents.off('completed', onCompleted)
        this.queueEvents.off('failed', onFailed)
      }
    })
  }

  private toResponse(workflow: WorkflowDocument): WorkflowResponse {
    return {
      id: workflow._id.toString(),
      status: workflow.status,
      prompt: workflow.prompt,
      spaceId: workflow.spaceId,
      createdAt:
        workflow.createdAt instanceof Date
          ? workflow.createdAt.toISOString()
          : String(workflow.createdAt),
      updatedAt:
        workflow.updatedAt instanceof Date
          ? workflow.updatedAt.toISOString()
          : String(workflow.updatedAt),
      result: workflow.result,
      sessionContext: workflow.sessionContext ?? {},
      nodeStates: workflow.nodeStates ?? DEFAULT_NODE_STATES,
      activeNodeId: workflow.activeNodeId,
      rerunHistory: workflow.rerunHistory ?? [],
      errorMessage: workflow.errorMessage,
    }
  }

  private resetDownstreamStates(
    currentStates: Partial<Record<WorkflowNodeId, WorkflowNodeStatus>>,
    fromNodeId: WorkflowNodeId,
  ): Partial<Record<WorkflowNodeId, WorkflowNodeStatus>> {
    const fromIndex = WORKFLOW_NODE_IDS.indexOf(fromNodeId)

    return WORKFLOW_NODE_IDS.reduce<Partial<Record<WorkflowNodeId, WorkflowNodeStatus>>>(
      (nextStates, nodeId, index) => {
        nextStates[nodeId] = index >= fromIndex ? 'PENDING' : (currentStates[nodeId] ?? 'PENDING')
        return nextStates
      },
      {},
    )
  }
}
