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
import { Model, Types } from 'mongoose'
import { Observable } from 'rxjs'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import {
  Workflow,
  WorkflowDocument,
  WorkflowSpaceType,
  WorkflowStatus,
} from './schemas/workflow.schema'
import {
  WorkflowNode,
  WorkflowNodeDocument,
  WorkflowNodeType,
} from './schemas/workflow-node.schema'
import { OrgService } from '../org/org.service'
import { KnowledgeService } from '../knowledge/knowledge.service'

export interface WorkflowResponse {
  id: string
  status: WorkflowStatus
  prompt: string
  spaceId: string
  spaceType: WorkflowSpaceType
  ownerUserId?: string
  teamId?: string
  enterpriseId?: string
  selectedKnowledgeBaseIds: string[]
  requiredKnowledgeBaseIds: string[]
  callableKnowledgeBaseIds: string[]
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
    private readonly orgService: OrgService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async onModuleInit() {
    this.queueEvents = new QueueEvents(WORKFLOW_QUEUE, {
      connection: this.workflowQueue.opts.connection,
    })
  }

  async onModuleDestroy() {
    await this.queueEvents.close()
  }

  async create(userId: string, dto: CreateWorkflowDto): Promise<WorkflowResponse> {
    const space = await this.orgService.resolveSpaceContext(userId, dto.spaceId)
    const selectedKnowledgeBaseIds = this.normalizeSelectedKnowledgeBaseIds(dto)
    const callableKnowledgeBaseIds = await this.knowledgeService.resolveCallableKnowledgeBases(
      userId,
      space.enterpriseId,
      dto.spaceId,
      selectedKnowledgeBaseIds,
    )
    const availableKnowledgeBases = await this.knowledgeService.findAvailable(
      userId,
      space.enterpriseId,
      dto.spaceId,
    )
    const requiredKnowledgeBaseIds = availableKnowledgeBases
      .filter((item) => item.required && callableKnowledgeBaseIds.includes(item.id))
      .map((item) => item.id)
    const brandRules = space.enterpriseId
      ? await this.orgService.getEnterpriseBrandRules(userId, space.enterpriseId)
      : undefined
    const policies = space.policies

    const workflow = await this.workflowModel.create({
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      spaceType: space.spaceType,
      ownerUserId: space.ownerUserId
        ? new Types.ObjectId(space.ownerUserId)
        : new Types.ObjectId(userId),
      teamId: space.teamId ? new Types.ObjectId(space.teamId) : undefined,
      enterpriseId: space.enterpriseId ? new Types.ObjectId(space.enterpriseId) : undefined,
      selectedKnowledgeBaseIds: this.toObjectIds(selectedKnowledgeBaseIds),
      requiredKnowledgeBaseIds: this.toObjectIds(requiredKnowledgeBaseIds),
      callableKnowledgeBaseIds: this.toObjectIds(callableKnowledgeBaseIds),
      brandRulesSnapshot: brandRules,
      policiesSnapshot: policies,
      status: 'pending',
    })

    // 初始化 6 个节点数据以供联调测试，对齐 Agent 的真实节点链路
    const nodeOrder = [
      'intentNode',
      'knowledgeNode',
      'promptNode',
      'generateNode',
      'evaluateNode',
      'finishNode',
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
        prompt: workflow.prompt,
        spaceId: workflow.spaceId,
        spaceType: workflow.spaceType,
        ownerUserId: workflow.ownerUserId?.toString(),
        teamId: workflow.teamId?.toString(),
        enterpriseId: workflow.enterpriseId?.toString(),
        selectedKnowledgeBaseIds,
        requiredKnowledgeBaseIds,
        callableKnowledgeBaseIds,
        brandRules,
        policies,
      },
      {
        jobId: `${workflow._id.toString()}-${Date.now()}`,
      },
    )

    return this.toResponse(workflow)
  }

  async getWorkflowDetail(id: string) {
    const workflow = await this.workflowModel.findById(id)
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`)
    }
    const nodes = await this.workflowNodeModel.find({ workflowId: id }).sort({ createdAt: 1 })
    return {
      workflow: this.toResponse(workflow),
      nodes,
    }
  }

  async updateNodeOutput(id: string, nodeType: WorkflowNodeType, payload: Record<string, unknown>) {
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
      'intentNode',
      'knowledgeNode',
      'promptNode',
      'generateNode',
      'evaluateNode',
      'finishNode',
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

  async runNode(id: string, nodeType: WorkflowNodeType) {
    // 触发对应节点的重新执行（实际会发布给 Agent 服务或 Processor，这里仅负责状态更改与触发）
    const node = await this.workflowNodeModel.findOne({ workflowId: id, type: nodeType })
    if (!node) {
      throw new NotFoundException(`Node ${nodeType} not found for workflow ${id}`)
    }

    node.status = 'pending'
    await node.save()

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

  streamWorkflow(id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: { type: 'connected', workflowId: id } })

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
      spaceType: workflow.spaceType,
      ownerUserId: workflow.ownerUserId?.toString(),
      teamId: workflow.teamId?.toString(),
      enterpriseId: workflow.enterpriseId?.toString(),
      selectedKnowledgeBaseIds: this.objectIdsToStrings(workflow.selectedKnowledgeBaseIds),
      requiredKnowledgeBaseIds: this.objectIdsToStrings(workflow.requiredKnowledgeBaseIds),
      callableKnowledgeBaseIds: this.objectIdsToStrings(workflow.callableKnowledgeBaseIds),
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

  private normalizeSelectedKnowledgeBaseIds(dto: CreateWorkflowDto): string[] {
    const ids = dto.selectedKnowledgeBaseIds?.length
      ? dto.selectedKnowledgeBaseIds
      : dto.knowledgeId
        ? [dto.knowledgeId]
        : []

    return Array.from(new Set(ids.filter(Boolean)))
  }

  private toObjectIds(ids: string[]): Types.ObjectId[] {
    return ids.map((id) => new Types.ObjectId(id))
  }

  private objectIdsToStrings(ids?: Types.ObjectId[]): string[] {
    return (ids ?? []).map((id) => id.toString())
  }
}
