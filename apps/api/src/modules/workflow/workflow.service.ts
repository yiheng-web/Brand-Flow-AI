import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
  OnModuleDestroy,
  MessageEvent,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { generateService } from '@brand-flow/agent'
import { Queue, QueueEvents } from 'bullmq'
import { Model } from 'mongoose'
import { Observable } from 'rxjs'
import { CreateArtTextCandidatesDto } from './dto/create-art-text-candidates.dto'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import { Workflow, WorkflowDocument, WorkflowStatus } from './schemas/workflow.schema'
import {
  WorkflowNode,
  WorkflowNodeDocument,
  WorkflowNodeType,
} from './schemas/workflow-node.schema'

export interface WorkflowResponse {
  id: string
  status: WorkflowStatus
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: Record<string, unknown>
  errorMessage?: string
}

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private queueEvents!: QueueEvents

  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
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

  private async verifyWorkflowAccess(
    id: string,
    userId: string,
    entId: string,
  ): Promise<WorkflowDocument> {
    const workflow = await this.workflowModel.findById(id)
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`)
    }

    // 第一道红线：跨企业隔离
    if (workflow.entId && entId && workflow.entId !== entId) {
      throw new ForbiddenException('跨企业越权访问被拒绝')
    }

    // 第二道红线：个人空间隔离
    if (workflow.spaceId === 'personal' && workflow.userId !== userId) {
      throw new ForbiddenException('个人空间工作流越权访问被拒绝')
    }

    return workflow
  }

  async create(dto: CreateWorkflowDto, userId: string, entId: string): Promise<WorkflowResponse> {
    const workflow = await this.workflowModel.create({
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      userId,
      entId,
      status: 'pending',
    })

    // 初始化 7 个节点数据以供联调测试，对齐 Agent 的真实节点链路
    const nodeOrder = [
      'brief',
      'brand_constraint',
      'creative_direction',
      'prompt',
      'image_generation',
      'composition',
      'brand_evaluation',
    ]

    await this.workflowNodeModel.insertMany(
      nodeOrder.map((type) => ({
        workflowId: workflow._id.toString(),
        type,
        status: 'pending',
        version: 1,
        userModified: false,
        input: {},
        output: {},
      })),
    )

    await this.workflowQueue.add(
      RUN_WORKFLOW_JOB,
      {
        workflowId: workflow._id.toString(),
        spaceType: dto.spaceType,
        selectedKnowledgeBaseIds: dto.selectedKnowledgeBaseIds,
      },
      {
        jobId: `${workflow._id.toString()}-${Date.now()}`,
      },
    )

    return this.toResponse(workflow)
  }

  async getWorkflowDetail(id: string, userId: string, entId: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const nodes = await this.workflowNodeModel.find({ workflowId: id }).sort({ createdAt: 1 })
    return {
      workflow: this.toResponse(workflow),
      nodes,
    }
  }

  async generateArtTextCandidates(
    id: string,
    dto: CreateArtTextCandidatesDto,
    userId: string,
    entId: string,
  ) {
    await this.verifyWorkflowAccess(id, userId, entId)

    return generateService.generateFourArtTextCandidates(
      dto.textContent,
      dto.stylePrompt ?? '',
      dto.negativePrompt ?? '',
    )
  }

  async updateNodeOutput(
    id: string,
    nodeType: WorkflowNodeType,
    payload: Record<string, unknown>,
    userId: string,
    entId: string,
  ) {
    await this.verifyWorkflowAccess(id, userId, entId)

    const node = await this.workflowNodeModel.findOne({ workflowId: id, type: nodeType })
    if (!node) {
      throw new NotFoundException(`Node ${nodeType} not found for workflow ${id}`)
    }

    // 1. 更新当前节点
    node.output = payload
    node.markModified('output')
    node.userModified = true
    node.version = (node.version || 1) + 1
    await node.save()

    // 2. 级联置空（下游 stale 机制）
    const nodeOrder = [
      'brief',
      'brand_constraint',
      'creative_direction',
      'prompt',
      'image_generation',
      'composition',
      'brand_evaluation',
    ]
    const currentIndex = nodeOrder.indexOf(nodeType)
    if (currentIndex !== -1 && currentIndex < nodeOrder.length - 1) {
      const downstreamTypes = nodeOrder.slice(currentIndex + 1)
      await this.workflowNodeModel.updateMany(
        { workflowId: id, type: { $in: downstreamTypes } },
        { $set: { status: 'stale', output: {} } },
      )
    }

    return node
  }

  async runNode(id: string, nodeType: WorkflowNodeType, userId: string, entId: string) {
    await this.verifyWorkflowAccess(id, userId, entId)

    // 触发对应节点的重新执行（实际会发布给 Agent 服务或 Processor，这里仅负责状态更改与触发）
    const node = await this.workflowNodeModel.findOne({ workflowId: id, type: nodeType })
    if (!node) {
      throw new NotFoundException(`Node ${nodeType} not found for workflow ${id}`)
    }

    node.status = 'pending'
    await node.save()

    // 把该节点下游的所有节点状态也置为 stale
    const nodeOrder = [
      'brief',
      'brand_constraint',
      'creative_direction',
      'prompt',
      'image_generation',
      'composition',
      'brand_evaluation',
    ]
    const currentIndex = nodeOrder.indexOf(nodeType)
    if (currentIndex !== -1 && currentIndex < nodeOrder.length - 1) {
      const downstreamTypes = nodeOrder.slice(currentIndex + 1)
      await this.workflowNodeModel.updateMany(
        { workflowId: id, type: { $in: downstreamTypes } },
        { $set: { status: 'stale', output: {} } },
      )
    }

    // 发送任务到消息队列触发 Agent
    await this.workflowQueue.add(
      `RUN_NODE_${nodeType.toUpperCase()}`,
      {
        workflowId: id,
        nodeType,
      },
      {
        jobId: `${id}-${Date.now()}`,
      },
    )

    return { success: true, message: `Node ${nodeType} queued for rerun.` }
  }

  streamWorkflow(id: string, userId: string, entId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      // 在连接前校验权限，如果不通过，则直接断开不予监听
      this.verifyWorkflowAccess(id, userId, entId)
        .then(() => {
          subscriber.next({ data: { type: 'connected', workflowId: id } })
        })
        .catch((err) => {
          subscriber.next({ data: { type: 'workflow_failed', error: err.message } })
          subscriber.complete()
        })

      const onProgress = ({ jobId, data }: { jobId: string; data: any }) => {
        if (!jobId) return
        if (String(jobId).startsWith(id)) {
          if (data && data.type) {
            subscriber.next({ data })
          }
        }
      }

      const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
        if (!jobId) return
        if (String(jobId).startsWith(id)) {
          subscriber.next({ data: { type: 'workflow_completed', data: returnvalue } })
          subscriber.complete()
        }
      }

      const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        if (!jobId) return
        if (String(jobId).startsWith(id)) {
          subscriber.next({ data: { type: 'workflow_failed', error: failedReason } })
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
      errorMessage: workflow.errorMessage,
    }
  }
}
