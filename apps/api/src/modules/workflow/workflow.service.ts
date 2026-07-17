import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
  MessageEvent,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { generateService } from '@brand-flow/agent'
import {
  createInitialWorkflowNodes,
  downstreamNodeTypes,
  normalizeWorkflowNodeType,
  type SpaceType,
  type WorkflowSseEvent,
} from '@brand-flow/contracts'
import { Queue, QueueEvents, type JobProgress } from 'bullmq'
import { Model } from 'mongoose'
import { Types } from 'mongoose'
import { Observable } from 'rxjs'
import { CreateArtTextCandidatesDto } from './dto/create-art-text-candidates.dto'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import { Workflow, WorkflowDocument, WorkflowStatus } from './schemas/workflow.schema'
import { WorkflowNode, WorkflowNodeDocument } from './schemas/workflow-node.schema'
import { User, UserDocument } from '../org/schemas/user.schema'
import { Team, TeamDocument } from '../org/schemas/team.schema'
import { Enterprise, EnterpriseDocument } from '../org/schemas/enterprise.schema'
import { Knowledge, KnowledgeDocument } from '../knowledge/schemas/knowledge.schema'

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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Team.name)
    private readonly teamModel: Model<TeamDocument>,
    @InjectModel(Enterprise.name)
    private readonly enterpriseModel: Model<EnterpriseDocument>,
    @InjectModel(Knowledge.name)
    private readonly knowledgeModel: Model<KnowledgeDocument>,
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
    entId?: string,
  ): Promise<WorkflowDocument> {
    const workflow = await this.workflowModel.findById(id)
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`)
    }

    await this.assertSpaceAccess(userId, workflow.spaceId)
    if (workflow.spaceType === 'personal' && workflow.userId !== userId) {
      throw new ForbiddenException('个人空间工作流越权访问被拒绝')
    }
    if (workflow.entId && entId && workflow.entId !== entId) {
      throw new ForbiddenException('当前登录企业与工作流所属企业不一致')
    }

    return workflow
  }

  async create(dto: CreateWorkflowDto, userId: string): Promise<WorkflowResponse> {
    if (!userId) throw new ForbiddenException('登录状态无效')
    const space = await this.assertSpaceAccess(userId, dto.spaceId)
    const selectedKnowledgeBaseIds = [...new Set(dto.selectedKnowledgeBaseIds ?? [])]
    await this.assertKnowledgeAccess(selectedKnowledgeBaseIds, dto.spaceId, space.entId)

    const workflow = await this.workflowModel.create({
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      spaceType: space.spaceType,
      userId,
      entId: space.entId,
      selectedKnowledgeBaseIds,
      status: 'pending',
    })

    await this.workflowNodeModel.insertMany(
      createInitialWorkflowNodes().map((node) => ({
        workflowId: workflow._id.toString(),
        ...node,
      })),
    )

    await this.workflowQueue.add(
      RUN_WORKFLOW_JOB,
      {
        workflowId: workflow._id.toString(),
      },
      {
        jobId: `${workflow._id.toString()}:main:v1`,
        removeOnComplete: 100,
        removeOnFail: 100,
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
    entId?: string,
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
    rawNodeType: string,
    payload: Record<string, unknown>,
    userId: string,
    entId?: string,
  ) {
    await this.verifyWorkflowAccess(id, userId, entId)
    const nodeType = normalizeWorkflowNodeType(rawNodeType)
    if (!nodeType) throw new BadRequestException('不支持的工作流节点类型')

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

    const workflow = await this.workflowModel.findById(id)
    if (workflow) {
      workflow.result = { ...(workflow.result || {}), [nodeType]: payload }
      workflow.markModified('result')
      await workflow.save()
    }

    // 2. 级联置空（下游 stale 机制）
    const downstreamTypes = downstreamNodeTypes(nodeType)
    if (downstreamTypes.length > 0) {
      await this.workflowNodeModel.updateMany(
        { workflowId: id, type: { $in: downstreamTypes } },
        { $set: { status: 'stale' } },
      )
    }

    return node
  }

  async runNode(id: string, rawNodeType: string, userId: string, entId?: string) {
    await this.verifyWorkflowAccess(id, userId, entId)
    const nodeType = normalizeWorkflowNodeType(rawNodeType)
    if (!nodeType) throw new BadRequestException('不支持的工作流节点类型')

    // 触发对应节点的重新执行（实际会发布给 Agent 服务或 Processor，这里仅负责状态更改与触发）
    const node = await this.workflowNodeModel.findOne({ workflowId: id, type: nodeType })
    if (!node) {
      throw new NotFoundException(`Node ${nodeType} not found for workflow ${id}`)
    }

    node.status = 'pending'
    await node.save()

    const downstreamTypes = downstreamNodeTypes(nodeType)
    if (downstreamTypes.length > 0) {
      await this.workflowNodeModel.updateMany(
        { workflowId: id, type: { $in: downstreamTypes } },
        { $set: { status: 'stale' } },
      )
    }

    // 发送任务到消息队列触发 Agent
    await this.workflowQueue.add(
      RUN_WORKFLOW_JOB,
      {
        workflowId: id,
        nodeType,
      },
      {
        jobId: `${id}:${nodeType}:v${node.version}:${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    )

    return { success: true, message: `Node ${nodeType} queued for rerun.` }
  }

  streamWorkflow(id: string, userId: string, entId?: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      // 在连接前校验权限，如果不通过，则直接断开不予监听
      this.verifyWorkflowAccess(id, userId, entId)
        .then(() => {
          subscriber.next({
            data: { type: 'workflow_started', workflowId: id, timestamp: new Date().toISOString() },
          })
        })
        .catch((err) => {
          subscriber.next({
            data: {
              type: 'workflow_failed',
              workflowId: id,
              error: { code: 'WORKFLOW_ACCESS_DENIED', message: err.message },
              timestamp: new Date().toISOString(),
            },
          })
          subscriber.complete()
        })

      const onProgress = ({ jobId, data }: { jobId: string; data: JobProgress }) => {
        if (!jobId) return
        if (String(jobId).startsWith(id)) {
          if (data && typeof data === 'object' && 'type' in data) {
            subscriber.next({ data: data as unknown as WorkflowSseEvent })
          }
        }
      }

      const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
        if (!jobId) return
        if (String(jobId).startsWith(id)) {
          subscriber.next({
            data: {
              type: 'workflow_completed',
              workflowId: id,
              result: returnvalue,
              timestamp: new Date().toISOString(),
            },
          })
          subscriber.complete()
        }
      }

      const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        if (!jobId) return
        if (String(jobId).startsWith(id)) {
          subscriber.next({
            data: {
              type: 'workflow_failed',
              workflowId: id,
              error: { code: 'WORKFLOW_JOB_FAILED', message: failedReason },
              timestamp: new Date().toISOString(),
            },
          })
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

  private async assertSpaceAccess(
    userId: string,
    spaceId: string,
  ): Promise<{ spaceType: SpaceType; entId?: string }> {
    if (spaceId === 'personal') return { spaceType: 'personal' }
    if (!Types.ObjectId.isValid(spaceId)) throw new ForbiddenException('空间不存在或无权访问')

    const user = await this.userModel.findById(userId)
    if (!user) throw new ForbiddenException('用户不存在')

    const team = await this.teamModel.findById(spaceId)
    if (team) {
      const membership = user.memberships.find(
        (item) =>
          item.teamId?.toString() === spaceId ||
          (!item.teamId && item.enterpriseId.toString() === team.enterpriseId.toString()),
      )
      if (!membership) throw new ForbiddenException('您不属于该团队空间')
      return { spaceType: 'team', entId: team.enterpriseId.toString() }
    }

    const enterprise = await this.enterpriseModel.findById(spaceId)
    const membership = user.memberships.find((item) => item.enterpriseId.toString() === spaceId)
    if (!enterprise || !membership) throw new ForbiddenException('您不属于该企业空间')
    return { spaceType: 'enterprise', entId: enterprise._id.toString() }
  }

  private async assertKnowledgeAccess(ids: string[], spaceId: string, entId?: string) {
    if (ids.length > 3) throw new BadRequestException('一次最多选择 3 个知识库')
    if (ids.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('知识库 ID 格式不正确')
    }
    if (ids.length === 0) return

    const query = entId
      ? { _id: { $in: ids }, $or: [{ spaceId }, { enterpriseId: new Types.ObjectId(entId) }] }
      : { _id: { $in: ids }, spaceId }
    const count = await this.knowledgeModel.countDocuments(query)
    if (count !== ids.length) throw new ForbiddenException('知识库不存在或不属于当前 Space')
  }
}
