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
import {
  createArtTextPlacementPlan,
  evaluateFinalImage,
  generateArtTextCandidates as generateControlledArtTextCandidates,
} from '@brand-flow/agent'
import {
  createInitialWorkflowNodes,
  downstreamNodeTypes,
  isNormalizedArtTextRegion,
  normalizeWorkflowNodeType,
  type ArtTextCandidate,
  type ArtTextPlacementPlan,
  type CompositionLayer,
  type CompositionOutput,
  type SpaceType,
  type WorkflowAwaitingAction,
  type WorkflowResult,
  type WorkflowSseEvent,
} from '@brand-flow/contracts'
import { Queue, QueueEvents, type JobProgress } from 'bullmq'
import { createHash } from 'node:crypto'
import { Model } from 'mongoose'
import { Types } from 'mongoose'
import { Observable } from 'rxjs'
import sharp from 'sharp'
import { CreateArtTextCandidatesDto } from './dto/create-art-text-candidates.dto'
import {
  CreatePlacementPlanDto,
  SaveCompositionDto,
  SelectArtTextCandidateDto,
} from './dto/composition.dto'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import { Workflow, WorkflowDocument, WorkflowStatus } from './schemas/workflow.schema'
import { WorkflowNode, WorkflowNodeDocument } from './schemas/workflow-node.schema'
import { User, UserDocument } from '../org/schemas/user.schema'
import { Team, TeamDocument } from '../org/schemas/team.schema'
import { Enterprise, EnterpriseDocument } from '../org/schemas/enterprise.schema'
import { Knowledge, KnowledgeDocument } from '../knowledge/schemas/knowledge.schema'
import { StorageService } from '../storage/storage.service'

export interface WorkflowResponse {
  id: string
  status: WorkflowStatus
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: Record<string, unknown>
  errorMessage?: string
  awaitingAction?: WorkflowAwaitingAction
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
    private readonly storageService: StorageService,
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
    const userSelectedKnowledgeBaseIds = [...new Set(dto.selectedKnowledgeBaseIds ?? [])]
    if (userSelectedKnowledgeBaseIds.length > 3) {
      throw new BadRequestException('一次最多主动选择 3 个知识库')
    }
    const requiredKnowledgeBaseIds = space.entId
      ? (
          await this.knowledgeModel.find({
            spaceId: space.entId,
            spaceType: 'enterprise',
            enterpriseId: new Types.ObjectId(space.entId),
            isRequired: true,
          })
        ).map((item) => item._id.toString())
      : []
    const selectedKnowledgeBaseIds = [
      ...new Set([...requiredKnowledgeBaseIds, ...userSelectedKnowledgeBaseIds]),
    ]
    await this.assertKnowledgeAccess(
      selectedKnowledgeBaseIds,
      dto.spaceId,
      space.spaceType,
      space.entId,
    )

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
        jobId: `${workflow._id.toString()}-main-v1`,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    )

    return this.toResponse(workflow)
  }

  async getWorkflowDetail(id: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const nodes = await this.workflowNodeModel.find({ workflowId: id }).sort({ createdAt: 1 })
    const response = this.toResponse(workflow)
    const result = response.result as WorkflowResult | undefined
    if (result?.generate) {
      result.generate.candidates = await Promise.all(
        result.generate.candidates.map(async (candidate) => {
          const objectKey = candidate.metadata?.objectKey
          return typeof objectKey === 'string'
            ? { ...candidate, imageUrl: await this.storageService.getSignedUrl(objectKey) }
            : candidate
        }),
      )
    }
    if (result?.compose && 'objectKey' in result.compose && result.compose.objectKey) {
      const signedUrl = await this.storageService.getSignedUrl(result.compose.objectKey)
      result.compose = { ...result.compose, finalImageUrl: signedUrl }
      result.finalImageUrl = signedUrl
      response.result = result as unknown as Record<string, unknown>
    }
    return {
      workflow: response,
      nodes,
    }
  }

  async generateArtTextCandidates(
    id: string,
    dto: CreateArtTextCandidatesDto,
    userId: string,
    entId?: string,
  ) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    const baseCandidate = result.generate?.candidates.find(
      (candidate) => candidate.id === dto.baseCandidateId,
    )
    if (!baseCandidate || result.generate?.selectedCandidateId !== dto.baseCandidateId) {
      throw new BadRequestException('底图候选不存在、未被选择或已经过期')
    }
    const baseObjectKey = baseCandidate.metadata?.objectKey
    if (typeof baseObjectKey !== 'string') {
      throw new BadRequestException('底图尚未持久化，无法生成艺术字候选')
    }
    const baseCandidateWithFreshUrl = {
      ...baseCandidate,
      imageUrl: await this.storageService.getSignedUrl(baseObjectKey),
    }
    if (
      !['completed', 'failed'].includes(workflow.status) &&
      (workflow.status !== 'awaiting_user' ||
        !['enter_art_text', 'select_art_text', 'select_art_text_region'].includes(
          workflow.awaitingAction ?? '',
        ))
    ) {
      throw new BadRequestException('工作流当前不接受艺术字输入')
    }

    let candidates: ArtTextCandidate[]
    try {
      candidates = await generateControlledArtTextCandidates(dto, baseCandidateWithFreshUrl)
    } catch (error) {
      result.compositionDraft = {
        baseCandidateId: dto.baseCandidateId,
        textContent: dto.textContent,
        stylePrompt: dto.stylePrompt,
        candidates: [],
      }
      delete result.compose
      delete result.finalEvaluation
      delete result.finalImageUrl
      workflow.result = result as unknown as Record<string, unknown>
      workflow.status = 'failed'
      workflow.awaitingAction = 'enter_art_text'
      workflow.errorMessage = error instanceof Error ? error.message : '艺术字生成失败'
      workflow.markModified('result')
      await workflow.save()
      await this.resetCompositionNodes(id)
      throw error
    }
    if (
      candidates.length !== 4 ||
      candidates.some((item) => item.textContent !== dto.textContent)
    ) {
      throw new BadRequestException('艺术字候选未满足四候选及文本一致性约束')
    }
    result.compositionDraft = {
      baseCandidateId: dto.baseCandidateId,
      textContent: dto.textContent,
      stylePrompt: dto.stylePrompt,
      candidates,
    }
    delete result.compose
    delete result.finalEvaluation
    delete result.finalImageUrl
    workflow.result = result as unknown as Record<string, unknown>
    workflow.status = 'awaiting_user'
    workflow.awaitingAction = 'select_art_text'
    workflow.errorMessage = undefined
    workflow.markModified('result')
    await workflow.save()
    await this.resetCompositionNodes(id)
    return result.compositionDraft
  }

  async selectArtTextCandidate(
    id: string,
    dto: SelectArtTextCandidateDto,
    userId: string,
    entId?: string,
  ) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    const draft = result.compositionDraft
    if (
      !['completed', 'failed'].includes(workflow.status) &&
      (workflow.status !== 'awaiting_user' ||
        !['select_art_text', 'select_art_text_region'].includes(workflow.awaitingAction ?? ''))
    ) {
      throw new BadRequestException('工作流当前不接受艺术字选择')
    }
    if (!draft || !draft.candidates.some((item) => item.id === dto.candidateId)) {
      throw new BadRequestException('艺术字候选不存在或已经过期')
    }
    draft.selectedArtTextCandidateId = dto.candidateId
    delete draft.placement
    delete result.compose
    delete result.finalEvaluation
    delete result.finalImageUrl
    workflow.result = result as unknown as Record<string, unknown>
    workflow.status = 'awaiting_user'
    workflow.awaitingAction = 'select_art_text_region'
    workflow.errorMessage = undefined
    workflow.markModified('result')
    await workflow.save()
    await this.resetCompositionNodes(id)
    return draft
  }

  async createPlacementPlan(
    id: string,
    dto: CreatePlacementPlanDto,
    userId: string,
    entId?: string,
  ) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    const draft = result.compositionDraft
    if (
      !['awaiting_user', 'failed'].includes(workflow.status) ||
      !['select_art_text_region', 'select_art_text'].includes(workflow.awaitingAction ?? '')
    ) {
      throw new BadRequestException('工作流当前不接受区域放置方案')
    }
    if (!draft || draft.selectedArtTextCandidateId !== dto.candidateId) {
      throw new BadRequestException('请先选择有效的艺术字候选')
    }
    if (!isNormalizedArtTextRegion(dto.region)) {
      throw new BadRequestException('框选区域必须位于画布内且使用 0～1 归一化坐标')
    }
    const candidate = draft.candidates.find((item) => item.id === dto.candidateId)
    if (!candidate) throw new BadRequestException('艺术字候选不存在或已经过期')
    const placement = await createArtTextPlacementPlan(candidate, dto.region)
    draft.region = dto.region
    draft.placement = placement
    workflow.result = result as unknown as Record<string, unknown>
    workflow.status = 'awaiting_user'
    workflow.awaitingAction = 'select_art_text_region'
    workflow.errorMessage = undefined
    workflow.markModified('result')
    await workflow.save()
    return placement
  }

  async saveComposition(
    id: string,
    dto: SaveCompositionDto,
    file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined,
    userId: string,
    entId?: string,
  ) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    if (
      !['awaiting_user', 'failed'].includes(workflow.status) ||
      workflow.awaitingAction !== 'select_art_text_region'
    ) {
      throw new BadRequestException('工作流当前不接受最终合成结果')
    }
    if (result.compose && result.finalEvaluation?.passed) {
      throw new BadRequestException('当前工作流成片已保存，请勿重复提交')
    }
    const previousObjectKey =
      result.compose && 'objectKey' in result.compose ? result.compose.objectKey : undefined
    const draft = result.compositionDraft
    if (
      !draft?.placement ||
      draft.baseCandidateId !== dto.baseCandidateId ||
      draft.selectedArtTextCandidateId !== dto.selectedArtTextCandidateId ||
      draft.textContent !== dto.textContent ||
      draft.stylePrompt !== dto.stylePrompt
    ) {
      throw new BadRequestException('合成输入与当前工作流版本不一致，请刷新后重试')
    }
    if (!result.brief) throw new BadRequestException('工作流缺少有效 Brief')
    this.assertPngFile(file)
    const placement = this.parseJson<ArtTextPlacementPlan>(dto.placement, '放置参数')
    const layers = this.parseJson<CompositionLayer[]>(dto.layers, '图层数据')
    if (JSON.stringify(placement) !== JSON.stringify(draft.placement)) {
      throw new BadRequestException('上传的放置参数与服务端方案不一致')
    }
    const artTextLayers = Array.isArray(layers)
      ? layers.filter((layer) => layer.type === 'art_text')
      : []
    const selectedCandidate = draft.candidates.find(
      (candidate) => candidate.id === dto.selectedArtTextCandidateId,
    )
    if (
      artTextLayers.length !== 1 ||
      !selectedCandidate ||
      !artTextLayers.some(
        (layer) =>
          layer.type === 'art_text' &&
          layer.candidateId === dto.selectedArtTextCandidateId &&
          layer.content === dto.textContent &&
          JSON.stringify(layer.region) === JSON.stringify(placement.region) &&
          JSON.stringify(layer.vectorSpec) === JSON.stringify(selectedCandidate.vectorSpec),
      )
    ) {
      throw new BadRequestException('图层数据未包含用户选中的艺术字')
    }
    const baseCandidate = result.generate?.candidates.find(
      (candidate) => candidate.id === dto.baseCandidateId,
    )
    const baseObjectKey = baseCandidate?.metadata?.objectKey
    if (typeof baseObjectKey !== 'string') {
      throw new BadRequestException('底图尚未持久化，无法验证合成来源')
    }
    if (dto.width * dto.height > 33_554_432) {
      throw new BadRequestException('合成图片像素总量超过 32MP 限制')
    }
    const pngWidth = file!.buffer!.readUInt32BE(16)
    const pngHeight = file!.buffer!.readUInt32BE(20)
    if (pngWidth !== dto.width || pngHeight !== dto.height) {
      throw new BadRequestException('PNG 实际分辨率与导出参数不一致')
    }
    await this.assertCompositionPixels(baseObjectKey, file!.buffer!, placement)
    const integritySha256 = createHash('sha256')
      .update(file!.buffer!)
      .update(
        JSON.stringify({
          workflowId: id,
          baseObjectKey,
          candidateId: dto.selectedArtTextCandidateId,
          textContent: dto.textContent,
          placement,
          vectorSpec: selectedCandidate.vectorSpec,
        }),
      )
      .digest('hex')

    const objectKey = `workflows/${userId}/${id}/composition/final-${Date.now()}.png`
    await this.storageService.uploadObject({
      key: objectKey,
      body: file!.buffer!,
      contentType: 'image/png',
      size: file!.size,
      metadata: { workflowId: id, candidateId: dto.selectedArtTextCandidateId },
    })
    const finalImageUrl = await this.storageService.getSignedUrl(objectKey)
    const composition: CompositionOutput = {
      baseCandidateId: dto.baseCandidateId,
      selectedArtTextCandidateId: dto.selectedArtTextCandidateId,
      textContent: dto.textContent,
      stylePrompt: dto.stylePrompt,
      placement,
      layers,
      finalImageUrl,
      objectKey,
      integrity: {
        sha256: integritySha256,
        renderer: 'fabric-v1',
        baseObjectKey,
        pixelRegionVerified: true,
      },
      exportSettings: { width: dto.width, height: dto.height, format: 'png' },
    }
    let finalEvaluation
    try {
      finalEvaluation = await evaluateFinalImage(
        finalImageUrl,
        result.brandConstraint ?? { required: [], recommended: [], optional: [], sources: [] },
        result.brief,
        composition,
      )
    } catch (error) {
      await this.storageService.deleteObject(objectKey).catch(() => undefined)
      workflow.status = 'failed'
      workflow.awaitingAction = 'select_art_text_region'
      workflow.errorMessage = error instanceof Error ? error.message : '最终品牌质检失败'
      await workflow.save()
      throw error
    }
    result.compose = composition
    result.finalImageUrl = finalImageUrl
    result.finalEvaluation = finalEvaluation
    workflow.result = result as unknown as Record<string, unknown>
    const awaitingAction: WorkflowAwaitingAction | undefined = finalEvaluation.passed
      ? undefined
      : finalEvaluation.suggestions.some((item) => /位置|区域|遮挡|裁切|对比/.test(item))
        ? 'select_art_text_region'
        : 'select_art_text'
    workflow.status = finalEvaluation.passed ? 'completed' : 'awaiting_user'
    workflow.awaitingAction = awaitingAction
    workflow.errorMessage = undefined
    workflow.markModified('result')
    await workflow.save()
    await this.workflowNodeModel.updateOne(
      { workflowId: id, type: 'compose' },
      { $set: { status: 'completed', output: composition, completedAt: new Date() } },
    )
    await this.workflowNodeModel.updateOne(
      { workflowId: id, type: 'finalEvaluation' },
      { $set: { status: 'completed', output: finalEvaluation, completedAt: new Date() } },
    )
    if (previousObjectKey && previousObjectKey !== objectKey) {
      await this.storageService.deleteObject(previousObjectKey).catch(() => undefined)
    }
    return { composition, finalEvaluation }
  }

  async updateNodeOutput(
    id: string,
    rawNodeType: string,
    payload: Record<string, unknown>,
    userId: string,
    entId?: string,
  ) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const nodeType = normalizeWorkflowNodeType(rawNodeType)
    if (!nodeType) throw new BadRequestException('不支持的工作流节点类型')

    const node = await this.workflowNodeModel.findOne({ workflowId: id, type: nodeType })
    if (!node) {
      throw new NotFoundException(`Node ${nodeType} not found for workflow ${id}`)
    }
    if (
      (nodeType === 'creativeDirection' &&
        (workflow.status !== 'awaiting_user' || workflow.awaitingAction !== 'select_direction')) ||
      (nodeType === 'generate' &&
        (workflow.status !== 'awaiting_user' || workflow.awaitingAction !== 'select_candidate'))
    ) {
      throw new BadRequestException('节点不在当前等待用户选择的版本中')
    }

    let nextPayload = payload
    if (nodeType === 'creativeDirection') {
      const existing = node.output as WorkflowResult['creativeDirection'] | undefined
      const selectedDirectionId = payload.selectedDirectionId
      if (
        !existing ||
        typeof selectedDirectionId !== 'string' ||
        !existing.directions.some((item) => item.id === selectedDirectionId)
      ) {
        throw new BadRequestException('创意方向不存在或已经过期')
      }
      nextPayload = { ...existing, selectedDirectionId } as unknown as Record<string, unknown>
    }
    if (nodeType === 'generate') {
      const existing = node.output as WorkflowResult['generate'] | undefined
      const selectedCandidateId = payload.selectedCandidateId
      const evaluation = existing?.evaluations.find(
        (item) => item.candidateId === selectedCandidateId,
      )
      if (
        !existing ||
        typeof selectedCandidateId !== 'string' ||
        !existing.candidates.some((item) => item.id === selectedCandidateId)
      ) {
        throw new BadRequestException('候选底图不存在或已经过期')
      }
      if (!evaluation || evaluation.totalScore < 6) {
        throw new BadRequestException('候选底图质检分低于 6 分，不能进入后续合成')
      }
      nextPayload = { ...existing, selectedCandidateId } as unknown as Record<string, unknown>
    }

    // 1. 更新当前节点
    node.output = nextPayload
    node.markModified('output')
    node.userModified = true
    node.version = (node.version || 1) + 1
    await node.save()

    if (workflow) {
      const nextResult = { ...(workflow.result || {}), [nodeType]: nextPayload } as WorkflowResult
      this.clearDownstreamResult(nextResult, nodeType)
      workflow.result = nextResult as unknown as Record<string, unknown>
      if (nodeType === 'generate' && nextResult.brief?.needsComposition) {
        workflow.status = 'awaiting_user'
        workflow.awaitingAction = 'enter_art_text'
      } else {
        workflow.status = 'running'
        workflow.awaitingAction = undefined
      }
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
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const nodeType = normalizeWorkflowNodeType(rawNodeType)
    if (!nodeType) throw new BadRequestException('不支持的工作流节点类型')

    // 触发对应节点的重新执行（实际会发布给 Agent 服务或 Processor，这里仅负责状态更改与触发）
    const node = await this.workflowNodeModel.findOne({ workflowId: id, type: nodeType })
    if (!node) {
      throw new NotFoundException(`Node ${nodeType} not found for workflow ${id}`)
    }

    const currentResult = (workflow.result as WorkflowResult | undefined) ?? {}
    const nodeGenerateCheckpoint = node.output as WorkflowResult['generate'] | undefined
    const failedGenerateCheckpoint =
      nodeType === 'generate' && node.status === 'failed'
        ? nodeGenerateCheckpoint?.candidates?.length
          ? nodeGenerateCheckpoint
          : currentResult.generate
        : undefined
    const canReuseGenerateCheckpoint =
      failedGenerateCheckpoint?.candidates?.length === 4 &&
      failedGenerateCheckpoint.candidates.every(
        (candidate) => typeof candidate.metadata?.objectKey === 'string',
      )

    node.status = 'pending'
    await node.save()

    const downstreamTypes = downstreamNodeTypes(nodeType)
    if (downstreamTypes.length > 0) {
      await this.workflowNodeModel.updateMany(
        { workflowId: id, type: { $in: downstreamTypes } },
        { $set: { status: 'stale' } },
      )
    }

    const nextResult = currentResult
    delete nextResult[nodeType]
    this.clearDownstreamResult(nextResult, nodeType)
    if (canReuseGenerateCheckpoint && failedGenerateCheckpoint) {
      nextResult.generate = {
        ...failedGenerateCheckpoint,
        evaluations: [],
        selectedCandidateId: '',
      }
    }
    workflow.result = nextResult as unknown as Record<string, unknown>
    workflow.status = 'running'
    workflow.awaitingAction = undefined
    workflow.markModified('result')
    await workflow.save()

    // 发送任务到消息队列触发 Agent
    await this.workflowQueue.add(
      RUN_WORKFLOW_JOB,
      {
        workflowId: id,
        nodeType,
      },
      {
        jobId: `${id}-${nodeType}-v${node.version}-${Date.now()}`,
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
        .then((workflow) => {
          subscriber.next({
            data: { type: 'workflow_started', workflowId: id, timestamp: new Date().toISOString() },
          })
          if (workflow.status === 'awaiting_user' && workflow.awaitingAction) {
            subscriber.next({
              data: {
                type: 'workflow_awaiting_user',
                workflowId: id,
                action: workflow.awaitingAction,
                result: workflow.result,
                timestamp: new Date().toISOString(),
              },
            })
          } else if (workflow.status === 'completed') {
            subscriber.next({
              data: {
                type: 'workflow_completed',
                workflowId: id,
                result: workflow.result,
                timestamp: new Date().toISOString(),
              },
            })
            subscriber.complete()
          } else if (workflow.status === 'failed') {
            subscriber.next({
              data: {
                type: 'workflow_failed',
                workflowId: id,
                error: {
                  code: 'WORKFLOW_FAILED',
                  message: workflow.errorMessage || '工作流执行失败',
                },
                timestamp: new Date().toISOString(),
              },
            })
            subscriber.complete()
          }
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

      const onCompleted = async ({
        jobId,
        returnvalue,
      }: {
        jobId: string
        returnvalue: unknown
      }) => {
        if (!jobId) return
        if (String(jobId).startsWith(id)) {
          const workflow = await this.workflowModel.findById(id)
          if (workflow?.status === 'awaiting_user' && workflow.awaitingAction) {
            subscriber.next({
              data: {
                type: 'workflow_awaiting_user',
                workflowId: id,
                action: workflow.awaitingAction,
                result: workflow.result,
                timestamp: new Date().toISOString(),
              },
            })
            return
          }
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
      awaitingAction: workflow.awaitingAction,
    }
  }

  private clearDownstreamResult(result: WorkflowResult, nodeType: string) {
    for (const downstream of downstreamNodeTypes(nodeType as never)) {
      delete result[downstream]
    }
    if (downstreamNodeTypes(nodeType as never).includes('compose')) {
      delete result.compositionDraft
      delete result.finalImageUrl
    }
  }

  private async resetCompositionNodes(workflowId: string) {
    await this.workflowNodeModel.updateMany(
      { workflowId, type: { $in: ['compose', 'finalEvaluation'] } },
      { $set: { status: 'pending' }, $unset: { output: 1, error: 1, errorMessage: 1 } },
    )
  }

  private assertPngFile(file: { buffer?: Buffer; mimetype?: string } | undefined) {
    const signature = file?.buffer?.subarray(0, 8)
    const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    if (
      !file?.buffer ||
      file.buffer.length > 25 * 1024 * 1024 ||
      file.mimetype !== 'image/png' ||
      !signature?.equals(expected)
    ) {
      throw new BadRequestException('仅允许上传具有正确文件头的 PNG 文件')
    }
  }

  private async assertCompositionPixels(
    baseObjectKey: string,
    finalPng: Buffer,
    placement: ArtTextPlacementPlan,
  ) {
    const baseObject = await this.storageService.getObject(baseObjectKey)
    if (baseObject.contentType !== 'image/png') {
      throw new BadRequestException('底图对象不是有效 PNG')
    }
    const [base, final] = await Promise.all([
      sharp(Buffer.from(baseObject.bytes))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      sharp(finalPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ])
    if (base.info.width !== final.info.width || base.info.height !== final.info.height) {
      throw new BadRequestException('合成 PNG 与底图尺寸不一致')
    }
    const width = base.info.width
    const height = base.info.height
    const left = Math.floor(placement.region.x * width)
    const top = Math.floor(placement.region.y * height)
    const right = Math.ceil((placement.region.x + placement.region.width) * width)
    const bottom = Math.ceil((placement.region.y + placement.region.height) * height)
    let changedInside = 0
    let changedOutside = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        let maxChannelDiff = 0
        for (let channel = 0; channel < 4; channel += 1) {
          maxChannelDiff = Math.max(
            maxChannelDiff,
            Math.abs(base.data[offset + channel] - final.data[offset + channel]),
          )
        }
        if (maxChannelDiff <= 8) continue
        if (x >= left && x < right && y >= top && y < bottom) changedInside += 1
        else changedOutside += 1
      }
    }
    const regionPixels = Math.max(1, (right - left) * (bottom - top))
    const outsidePixels = Math.max(1, width * height - regionPixels)
    if (changedInside < Math.max(64, Math.floor(regionPixels * 0.001))) {
      throw new BadRequestException('框选区域内未检测到足够的艺术字像素变化')
    }
    if (changedOutside > Math.max(64, Math.floor(outsidePixels * 0.001))) {
      throw new BadRequestException('框选区域外发生了异常变化，底图可能已被重新生成或篡改')
    }
  }

  private parseJson<T>(value: string, fieldName: string): T {
    try {
      return JSON.parse(value) as T
    } catch {
      throw new BadRequestException(`${fieldName}不是有效 JSON`)
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

  private async assertKnowledgeAccess(
    ids: string[],
    spaceId: string,
    spaceType: SpaceType,
    entId?: string,
  ) {
    if (ids.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('知识库 ID 格式不正确')
    }
    if (ids.length === 0) return

    const scopeFilters: Record<string, unknown>[] = [{ spaceId }]
    if (spaceType === 'enterprise' && entId) {
      scopeFilters.push({ spaceId: { $exists: false }, enterpriseId: new Types.ObjectId(entId) })
    }
    if (spaceType === 'team' && entId) {
      scopeFilters.push({
        spaceId: entId,
        spaceType: 'enterprise',
        enterpriseId: new Types.ObjectId(entId),
        isRequired: true,
      })
    }
    const query = { _id: { $in: ids }, $or: scopeFilters }
    const count = await this.knowledgeModel.countDocuments(query)
    if (count !== ids.length) throw new ForbiddenException('知识库不存在或不属于当前 Space')
  }
}
