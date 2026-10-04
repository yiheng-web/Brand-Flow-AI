import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
  MessageEvent,
  Logger,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import {
  createArtTextPlacementPlan,
  evaluateFinalImage,
  generateArtTextCandidates as generateControlledArtTextCandidates,
  revisePromptPlan,
  resolveImageGenerationConfig,
} from '@brand-flow/agent'
import {
  createInitialWorkflowNodes,
  WORKFLOW_NODE_ORDER,
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
  type WorkflowNodeType,
  type BrandRequirementInput,
} from '@brand-flow/contracts'
import { Queue, QueueEvents } from 'bullmq'
import { createHash, randomUUID } from 'node:crypto'
import { Model } from 'mongoose'
import { Types } from 'mongoose'
import type { ArtTextRegion } from '@brand-flow/contracts'
import { WorkflowReferencesService } from './workflow-references.service'
import { Observable } from 'rxjs'
import sharp from 'sharp'
import { assertObjectId, assertPersonalOwner, personalCreatorFilter } from '@/common/personal-scope'
import { CreateArtTextCandidatesDto } from './dto/create-art-text-candidates.dto'
import {
  CreatePlacementPlanDto,
  SaveCompositionDto,
  SelectArtTextCandidateDto,
} from './dto/composition.dto'
import { CreateWorkflowDto, StartWorkflowDto } from './dto/create-workflow.dto'
import { OptimizeWorkflowDto, UpdateBriefDto } from './dto/brief-review.dto'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import { Workflow, WorkflowDocument, WorkflowStatus } from './schemas/workflow.schema'
import { WorkflowNode, WorkflowNodeDocument } from './schemas/workflow-node.schema'
import { WorkflowRevision, WorkflowRevisionDocument } from './schemas/workflow-revision.schema'
import { User, UserDocument } from '../org/schemas/user.schema'
import { Team, TeamDocument } from '../org/schemas/team.schema'
import { Enterprise, EnterpriseDocument } from '../org/schemas/enterprise.schema'
import { Knowledge, KnowledgeDocument } from '../knowledge/schemas/knowledge.schema'
import { StorageService } from '../storage/storage.service'
import {
  trackWorkflow,
  persistWorkflowState,
  persistNodeState,
  adoptWorkflowNodes,
  StaleWorkflowError,
} from './workflow-state'
import { ListWorkflowsDto } from './dto/list-workflows.dto'

export interface WorkflowResponse {
  references?: WorkflowDocument['references']
  generationConfig?: WorkflowDocument['generationConfig']
  id: string
  status: WorkflowStatus
  prompt: string
  spaceId: string
  createdAt: string
  updatedAt: string
  result?: Record<string, unknown>
  errorMessage?: string
  awaitingAction?: WorkflowAwaitingAction
  requirements?: BrandRequirementInput
  needsComposition?: boolean
  runVersion: number
  eventSequence: number
  currentNode?: WorkflowNodeType
  progress: number
}

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowService.name)
  private queueEvents!: QueueEvents

  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(WorkflowRevision.name)
    private readonly workflowRevisionModel: Model<WorkflowRevisionDocument>,
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
    private readonly referencesService?: WorkflowReferencesService,
  ) {}

  async onModuleInit() {
    this.queueEvents = new QueueEvents(WORKFLOW_QUEUE, {
      connection: this.workflowQueue.opts.connection,
      prefix: this.workflowQueue.opts.prefix,
    })
    // 升级前的队列载荷没有版本号，不能再允许其写回；保留任务供用户安全重试。
    const legacyRuns = await this.workflowModel.find({
      status: 'running',
      runVersion: { $exists: false },
    })
    for (const legacy of legacyRuns) {
      const workflow = trackWorkflow(legacy)
      workflow.status = 'failed'
      workflow.errorMessage = '任务来自旧版本，请重试以继续创作'
      try {
        await persistWorkflowState(this.workflowModel, workflow, true)
        await adoptWorkflowNodes(this.workflowNodeModel, workflow)
      } catch (error) {
        if (!(error instanceof StaleWorkflowError)) throw error
      }
    }
  }

  async onModuleDestroy() {
    await this.queueEvents.close()
  }

  private async verifyWorkflowAccess(
    id: string,
    userId: string,
    entId?: string,
  ): Promise<WorkflowDocument> {
    assertObjectId(id)
    const workflow = await this.workflowModel.findOne({
      _id: id,
      $or: [
        { spaceId: 'personal', userId },
        { spaceId: { $ne: 'personal' }, spaceType: { $ne: 'personal' } },
      ],
    })
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`)
    }

    await this.assertSpaceAccess(userId, workflow.spaceId)
    if (workflow.spaceType === 'personal' || workflow.spaceId === 'personal') {
      assertPersonalOwner(userId, workflow.userId)
    }
    if (workflow.spaceId !== 'personal' && workflow.entId && entId && workflow.entId !== entId) {
      throw new ForbiddenException('当前登录企业与工作流所属企业不一致')
    }

    return trackWorkflow(workflow)
  }

  async create(dto: CreateWorkflowDto, userId: string): Promise<WorkflowResponse> {
    if (!userId) throw new ForbiddenException('登录状态无效')
    const space = await this.assertSpaceAccess(userId, dto.spaceId)
    if (dto.references?.length && space.spaceType !== 'personal')
      throw new BadRequestException('参考素材当前仅支持个人空间')
    const references = dto.references?.length
      ? await this.referencesService!.resolve(dto.references, userId)
      : []
    if (dto.generationConfig || dto.requirements?.aspectRatio) {
      try {
        resolveImageGenerationConfig(
          {
            ...dto.generationConfig,
            aspectRatio: dto.generationConfig?.aspectRatio ?? dto.requirements?.aspectRatio,
          },
          process.env.IMAGE_MODEL || 'Kwai-Kolors/Kolors',
          process.env.IMAGE_SIZE || '1024x1024',
        )
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : '生成参数不受支持')
      }
    }
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
      userId,
      space.entId,
    )

    const workflow = await this.workflowModel.create({
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      spaceType: space.spaceType,
      userId,
      entId: space.entId,
      selectedKnowledgeBaseIds,
      requirements: dto.requirements,
      references,
      generationConfig: dto.generationConfig,
      status: 'pending',
    })

    await this.workflowNodeModel.insertMany(
      createInitialWorkflowNodes().map((node) => ({
        workflowId: workflow._id.toString(),
        ...node,
      })),
    )

    return this.toResponse(workflow)
  }

  async start(
    id: string,
    dto: StartWorkflowDto,
    userId: string,
    entId?: string,
  ): Promise<WorkflowResponse> {
    const accessibleWorkflow = await this.verifyWorkflowAccess(id, userId, entId)
    if (accessibleWorkflow.status !== 'pending') {
      return this.toResponse(accessibleWorkflow)
    }

    accessibleWorkflow.needsComposition = dto.needsComposition
    accessibleWorkflow.status = 'running'
    accessibleWorkflow.currentNode = 'brief'
    accessibleWorkflow.errorMessage = undefined
    try {
      await this.saveWorkflow(accessibleWorkflow)
    } catch (error) {
      if (error instanceof StaleWorkflowError)
        return this.toResponse(await this.verifyWorkflowAccess(id, userId, entId))
      throw error
    }
    await this.queueNode(accessibleWorkflow, 'brief')
    const workflow = accessibleWorkflow

    return this.toResponse(workflow)
  }

  async getWorkflowDetail(id: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const nodes = await this.workflowNodeModel.find({ workflowId: id }).sort({ createdAt: 1 })
    const response = this.toResponse(workflow)
    if (response.references?.length)
      response.references = await Promise.all(
        response.references.map(async (reference) => ({
          ...reference,
          imageUrl: await this.storageService.getSignedUrl(reference.objectKey),
        })),
      )
    response.result = (await this.signResultImages(
      response.result as WorkflowResult | undefined,
    )) as Record<string, unknown> | undefined
    return {
      workflow: response,
      nodes,
    }
  }

  private async signResultImages(
    source: WorkflowResult | undefined,
  ): Promise<WorkflowResult | undefined> {
    if (!source) return undefined
    const result = { ...source }
    if (result?.references?.length)
      result.references = await Promise.all(
        result.references.map(async (reference) => ({
          ...reference,
          imageUrl: await this.storageService.getSignedUrl(reference.objectKey),
        })),
      )
    if (result?.generate) {
      result.generate = {
        ...result.generate,
        candidates: await Promise.all(
          result.generate.candidates.map(async (candidate) => {
            const objectKey = candidate.metadata?.objectKey
            return typeof objectKey === 'string'
              ? { ...candidate, imageUrl: await this.storageService.getSignedUrl(objectKey) }
              : candidate
          }),
        ),
      }
    }
    if (result?.compose && 'objectKey' in result.compose && result.compose.objectKey) {
      const signedUrl = await this.storageService.getSignedUrl(result.compose.objectKey)
      result.compose = { ...result.compose, finalImageUrl: signedUrl }
      result.finalImageUrl = signedUrl
    }
    return result
  }

  async confirmBrief(id: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    if (
      workflow.status !== 'awaiting_user' ||
      workflow.awaitingAction !== 'confirm_brief' ||
      !result.brief
    ) {
      throw new BadRequestException('当前工作流没有待确认的 Brief')
    }
    result.briefReview = {
      status: 'confirmed',
      source: result.briefReview?.source ?? 'generated',
      version: result.briefReview?.version ?? 1,
      confirmedAt: new Date().toISOString(),
    }
    workflow.result = result as unknown as Record<string, unknown>
    workflow.status = 'running'
    workflow.awaitingAction = undefined
    workflow.errorMessage = undefined
    workflow.markModified('result')
    await this.saveWorkflow(workflow)
    await this.queueNode(workflow, 'brandConstraint')
    return result.briefReview
  }

  async updateBrief(id: string, dto: UpdateBriefDto, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    if (workflow.status !== 'awaiting_user' || workflow.awaitingAction !== 'confirm_brief') {
      throw new BadRequestException('当前工作流不接受 Brief 修改')
    }
    const version = (result.briefReview?.version ?? 1) + 1
    result.brief = dto
    result.briefReview = { status: 'pending', source: 'user_modified', version }
    this.clearDownstreamResult(result, 'brief')
    const node = await this.workflowNodeModel.findOne({ workflowId: id, type: 'brief' })
    if (!node) throw new NotFoundException('Brief 节点不存在')
    node.output = dto as unknown as Record<string, unknown>
    node.userModified = true
    node.version = version
    node.status = 'completed'
    node.markModified('output')
    // 节点将在父工作流 CAS 成功后写入。
    workflow.result = result as unknown as Record<string, unknown>
    workflow.markModified('result')
    await this.saveWorkflow(workflow)
    await this.writeNode(workflow, node._id, {
      output: node.output,
      userModified: true,
      version: node.version,
      status: 'completed',
    })
    return this.confirmBrief(id, userId, entId)
  }

  async regenerateBrief(id: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    if (workflow.status !== 'awaiting_user' || workflow.awaitingAction !== 'confirm_brief') {
      throw new BadRequestException('当前工作流不接受 Brief 重新生成')
    }
    return this.runNode(id, 'brief', userId, entId)
  }

  async optimize(id: string, dto: OptimizeWorkflowDto, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    const sourceCandidate = result.generate?.candidates.find(
      (candidate) => candidate.id === dto.sourceCandidateId,
    )
    const direction = result.creativeDirection?.directions.find(
      (item) => item.id === result.creativeDirection?.selectedDirectionId,
    )
    if (
      !sourceCandidate ||
      !result.brief ||
      !result.brandConstraint ||
      !result.prompt ||
      !direction
    ) {
      throw new BadRequestException('当前工作流缺少可优化的候选图或上游上下文')
    }
    const feedback = {
      ...dto,
      preserveBrandPositioning: true as const,
      preserveCoreSubject: true as const,
    }
    await this.beginAction(workflow, 'prompt')
    try {
      const revisedPrompt = await revisePromptPlan(
        result.brief,
        direction,
        result.brandConstraint,
        result.prompt,
        feedback,
        result.references,
      )
      // 优化只调整创意提示词，保留用户已确认的画面参数。
      revisedPrompt.generationConfig = { ...result.prompt.generationConfig }
      const round =
        (await this.workflowRevisionModel.countDocuments({ workflowId: workflow._id })) + 1
      const revision = await this.workflowRevisionModel.create({
        workflowId: workflow._id,
        round,
        runVersion: workflow.runVersion,
        feedback,
        previousPrompt: result.prompt,
        revisedPrompt,
        previousGenerate: result.generate ?? {},
        status: 'queued',
      })
      result.prompt = revisedPrompt
      result.revision = { id: revision._id.toString(), round, feedback }
      this.clearDownstreamResult(result, 'prompt')
      // Prompt 在父工作流认领成功后写入。
      // 下游状态在新版本保存后重置。
      workflow.result = result as unknown as Record<string, unknown>
      workflow.status = 'running'
      workflow.awaitingAction = undefined
      workflow.errorMessage = undefined
      workflow.markModified('result')
      await this.saveWorkflow(workflow, false)
      await this.writeNodes(workflow, ['prompt'], {
        $set: { output: revisedPrompt, userModified: true },
        $inc: { version: 1 },
      })
      await this.writeNodes(workflow, ['generate', 'compose', 'finalEvaluation'], {
        status: 'stale',
        $unset: { output: 1, error: 1, errorMessage: 1 },
      })
      await this.queueNode(workflow, 'generate')
      return { revisionId: revision._id.toString(), round, revisedPrompt }
    } catch (error) {
      if (!(error instanceof StaleWorkflowError) && workflow.status !== 'failed') {
        workflow.status = 'failed'
        workflow.errorMessage = '当前操作失败，请重试'
        await this.saveWorkflow(workflow, false)
      }
      throw error
    }
  }

  async getRevisions(id: string, userId: string, entId?: string) {
    await this.verifyWorkflowAccess(id, userId, entId)
    const revisions = await this.workflowRevisionModel.find({ workflowId: id }).sort({ round: -1 })
    // 仅刷新返回值中的短时链接，不改写历史快照及其不可变对象键。
    return Promise.all(
      revisions.map(async (revision) => {
        if (
          revision.result?.compose &&
          'objectKey' in revision.result.compose &&
          revision.result.compose.objectKey &&
          !revision.result.compose.objectKey.startsWith(`workflows/${userId}/${id}/`)
        )
          throw new BadRequestException('Revision 成片缺少可信归属')
        return { ...revision.toObject(), result: await this.signResultImages(revision.result) }
      }),
    )
  }

  async getResultDownload(id: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = (workflow.result as WorkflowResult | undefined) ?? {}
    const composedKey =
      result.compose && 'objectKey' in result.compose ? result.compose.objectKey : undefined
    const selected = result.generate?.candidates.find(
      (candidate) => candidate.id === result.generate?.selectedCandidateId,
    )
    const objectKey = composedKey || selected?.metadata?.objectKey
    if (typeof objectKey !== 'string') throw new BadRequestException('当前结果尚未持久化，无法下载')
    return {
      fileName: `brand-flow-${id}.png`,
      downloadUrl: await this.storageService.getSignedUrl(objectKey, { expiresIn: 60 * 10 }),
    }
  }

  async getCandidateDownload(id: string, candidateId: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const result = workflow.result as WorkflowResult | undefined
    const candidate = result?.generate?.candidates.find((image) => image.id === candidateId)
    if (!candidate) throw new NotFoundException('候选图不存在或已过期')
    const objectKey = candidate.metadata?.objectKey
    if (
      typeof objectKey !== 'string' ||
      !objectKey.startsWith(`workflows/${workflow.userId}/${id}/`)
    )
      throw new BadRequestException('候选图尚未持久化')
    return {
      fileName: `brand-flow-${id}-${candidateId}.png`,
      downloadUrl: await this.storageService.getSignedUrl(objectKey, {
        expiresIn: 600,
        downloadName: `candidate-${candidateId}.png`,
      }),
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

    await this.beginAction(workflow, 'compose')
    try {
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
        await this.saveWorkflow(workflow, false)
        await this.resetCompositionNodes(workflow)
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
      await this.saveWorkflow(workflow, false)
      await this.resetCompositionNodes(workflow)
      return result.compositionDraft
    } catch (error) {
      if (!(error instanceof StaleWorkflowError) && workflow.status !== 'failed') {
        workflow.status = 'failed'
        workflow.errorMessage = '当前操作失败，请重试'
        await this.saveWorkflow(workflow, false)
      }
      throw error
    }
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
    await this.saveWorkflow(workflow)
    await this.resetCompositionNodes(workflow)
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
    await this.beginAction(workflow, 'compose')
    try {
      const placement = await createArtTextPlacementPlan(candidate, dto.region)
      draft.region = dto.region
      draft.placement = placement
      workflow.result = result as unknown as Record<string, unknown>
      workflow.status = 'awaiting_user'
      workflow.awaitingAction = 'select_art_text_region'
      workflow.errorMessage = undefined
      workflow.markModified('result')
      await this.saveWorkflow(workflow, false)
      return placement
    } catch (error) {
      if (!(error instanceof StaleWorkflowError) && workflow.status !== 'failed') {
        workflow.status = 'failed'
        workflow.errorMessage = '当前操作失败，请重试'
        await this.saveWorkflow(workflow, false)
      }
      throw error
    }
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
    if (
      !Array.isArray(layers) ||
      layers.some((layer) => !layer || typeof layer !== 'object' || Array.isArray(layer))
    )
      throw new BadRequestException('图层数据必须为有效对象数组')
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
    const logoLayers = layers.filter((layer) => layer.type === 'logo')
    const logoReferences = (result.references ?? []).filter(
      (reference) => reference.strategy === 'compose_logo',
    )
    if (
      logoLayers.length !== logoReferences.length ||
      new Set(logoLayers.map((layer) => layer.assetId)).size !== logoLayers.length
    )
      throw new BadRequestException('Logo 图层必须对应本轮已验证的原图素材')
    for (const layer of logoLayers) {
      if (
        !logoReferences.some((reference) => reference.assetId === layer.assetId) ||
        !layer.visible ||
        !layer.region ||
        ![layer.region.x, layer.region.y, layer.region.width, layer.region.height].every(
          (value) => Number.isFinite(value) && value >= 0,
        ) ||
        layer.region.width <= 0 ||
        layer.region.height <= 0 ||
        layer.region.width > 0.3 ||
        layer.region.height > 0.3 ||
        layer.region.x + layer.region.width > 1 ||
        layer.region.y + layer.region.height > 1
      )
        throw new BadRequestException('Logo 图层来源或区域不合法')
    }
    if (logoReferences.length)
      await this.referencesService!.resolve(
        logoReferences.map(({ assetId, role }) => ({ assetId, role })),
        userId,
      )
    await this.assertCompositionPixels(
      baseObjectKey,
      file!.buffer!,
      placement,
      logoLayers.map((layer) => layer.region),
    )
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

    await this.beginAction(workflow, 'compose')
    let uploadedObjectKey: string | undefined
    let compositionCommitted = false
    try {
      const objectKey = `workflows/${userId}/${id}/runs/${workflow.runVersion}/composition/${randomUUID()}.png`
      await this.storageService.uploadObject({
        key: objectKey,
        body: file!.buffer!,
        contentType: 'image/png',
        size: file!.size,
        metadata: { workflowId: id, candidateId: dto.selectedArtTextCandidateId },
      })
      uploadedObjectKey = objectKey
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
        workflow.status = 'failed'
        workflow.awaitingAction = 'select_art_text_region'
        workflow.errorMessage = error instanceof Error ? error.message : '最终品牌质检失败'
        await this.saveWorkflow(workflow, false)
        throw error
      }
      const awaitingAction: WorkflowAwaitingAction | undefined = finalEvaluation.passed
        ? undefined
        : finalEvaluation.suggestions.some((item) => /位置|区域|遮挡|裁切|对比/.test(item))
          ? 'select_art_text_region'
          : 'select_art_text'
      await this.writeNodes(workflow, ['compose'], {
        status: 'completed',
        output: composition,
        completedAt: new Date(),
      })
      await this.writeNodes(workflow, ['finalEvaluation'], {
        status: 'completed',
        output: finalEvaluation,
        completedAt: new Date(),
      })
      result.compose = composition
      result.finalImageUrl = finalImageUrl
      result.finalEvaluation = finalEvaluation
      workflow.result = result as unknown as Record<string, unknown>
      workflow.status = finalEvaluation.passed ? 'completed' : 'awaiting_user'
      workflow.awaitingAction = awaitingAction
      workflow.errorMessage = undefined
      workflow.progress = finalEvaluation.passed ? 100 : workflow.progress
      workflow.markModified('result')
      await this.saveWorkflow(workflow, false)
      compositionCommitted = true
      // 历史合成对象可能已被 Revision 或作品版本引用，保留不可变来源。
      if (result.revision?.id)
        await this.workflowRevisionModel.updateOne(
          {
            _id: result.revision.id,
            workflowId: workflow._id,
            status: { $in: ['queued', 'failed'] },
          },
          { $set: { result, status: finalEvaluation.passed ? 'completed' : 'queued' } },
        )
      return { composition, finalEvaluation }
    } catch (error) {
      if (uploadedObjectKey && !compositionCommitted) {
        await this.storageService
          .deleteObject(uploadedObjectKey)
          .catch(() => this.logger.warn(`工作流 ${id} 的未提交合成对象清理失败`))
      }
      if (!(error instanceof StaleWorkflowError) && workflow.status !== 'failed') {
        workflow.status = 'failed'
        workflow.errorMessage = '当前操作失败，请重试'
        await this.saveWorkflow(workflow, false)
      }
      throw error
    }
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

    const editableKey =
      nodeType === 'creativeDirection'
        ? 'selectedDirectionId'
        : nodeType === 'generate'
          ? 'selectedCandidateId'
          : undefined
    if (!editableKey || Object.keys(payload).some((key) => key !== editableKey))
      throw new BadRequestException('仅允许选择已有创意方向或候选图；服务端输出不可编辑')
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
    // 父工作流先认领新版本，避免旧选择污染新结果。

    if (workflow) {
      const nextResult = { ...(workflow.result || {}), [nodeType]: nextPayload } as WorkflowResult
      this.clearDownstreamResult(nextResult, nodeType)
      workflow.result = nextResult as unknown as Record<string, unknown>
      if (nodeType === 'generate' && nextResult.brief?.needsComposition) {
        workflow.status = 'awaiting_user'
        workflow.awaitingAction = 'enter_art_text'
      } else {
        workflow.status = 'awaiting_user'
        workflow.awaitingAction =
          nodeType === 'creativeDirection' ? 'select_direction' : 'select_candidate'
      }
      workflow.markModified('result')
      await this.saveWorkflow(workflow)
    }

    await this.writeNode(workflow, node._id, {
      output: nextPayload,
      userModified: true,
      version: node.version,
    })

    // 2. 级联置空（下游 stale 机制）
    const downstreamTypes = downstreamNodeTypes(nodeType)
    if (downstreamTypes.length > 0) {
      await this.writeNodes(workflow, downstreamTypes, { status: 'stale' })
    }

    return node
  }

  async runNode(id: string, rawNodeType: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    const nodeType = normalizeWorkflowNodeType(rawNodeType)
    if (!nodeType) throw new BadRequestException('不支持的工作流节点类型')

    if (workflow.status === 'cancelled') throw new BadRequestException('已取消任务不能重试')
    if (workflow.status === 'running') return { success: true, message: '当前版本已在执行' }
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

    workflow.status = 'running'
    workflow.currentNode = nodeType
    workflow.progress = Math.round(
      (WORKFLOW_NODE_ORDER.indexOf(nodeType) / WORKFLOW_NODE_ORDER.length) * 100,
    )
    workflow.awaitingAction = undefined
    workflow.errorMessage = undefined
    try {
      await this.saveWorkflow(workflow)
    } catch (error) {
      if (error instanceof StaleWorkflowError)
        return { success: true, message: '当前动作已由其他请求认领' }
      throw error
    }
    try {
      await this.writeNode(workflow, node._id, { status: 'pending' })

      const downstreamTypes = downstreamNodeTypes(nodeType)
      if (downstreamTypes.length > 0) {
        await this.writeNodes(workflow, downstreamTypes, { status: 'stale' })
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
      await this.saveWorkflow(workflow, false)

      await this.queueNode(workflow, nodeType)

      return { success: true, message: `Node ${nodeType} queued for rerun.` }
    } catch (error) {
      if (!(error instanceof StaleWorkflowError) && workflow.status === 'running') {
        workflow.status = 'failed'
        workflow.errorMessage = '任务准备失败，请重试'
        await this.saveWorkflow(workflow, false)
      }
      throw error
    }
  }

  async listWorkflows(query: ListWorkflowsDto, userId: string) {
    await this.assertSpaceAccess(userId, query.spaceId)
    const filter = {
      userId,
      spaceId: query.spaceId,
      ...(query.status ? { status: query.status } : {}),
    }
    const [workflows, total] = await Promise.all([
      this.workflowModel
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      this.workflowModel.countDocuments(filter),
    ])
    return {
      items: workflows.map((workflow) => this.toResponse(workflow)),
      total,
      page: query.page,
      limit: query.limit,
    }
  }

  async cancel(id: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    if (workflow.status === 'cancelled') return this.toResponse(workflow)
    if (workflow.status === 'completed') throw new BadRequestException('已完成任务不能取消')
    workflow.status = 'cancelled'
    workflow.awaitingAction = undefined
    await this.saveWorkflow(workflow)
    await this.writeNodes(workflow, [...WORKFLOW_NODE_ORDER], { status: 'stale' })
    return this.toResponse(workflow)
  }

  async retry(id: string, userId: string, entId?: string) {
    const workflow = await this.verifyWorkflowAccess(id, userId, entId)
    if (workflow.status === 'running') return { success: true, message: '任务已在执行' }
    if (workflow.status !== 'failed') throw new BadRequestException('只能重试失败任务')
    return this.runNode(id, workflow.currentNode ?? 'brief', userId, entId)
  }

  async streamWorkflow(
    id: string,
    userId: string,
    entId?: string,
  ): Promise<Observable<MessageEvent>> {
    await this.verifyWorkflowAccess(id, userId, entId)
    return new Observable<MessageEvent>((subscriber) => {
      let sequence = -1
      let reading = false
      const publish = async () => {
        if (reading || subscriber.closed) return
        reading = true
        try {
          // 注册监听后重新读快照；队列通知只触发读库，旧任务事件不能改变客户端事实。
          const snapshot = await this.getWorkflowDetail(id, userId, entId)
          if (subscriber.closed) return
          if (snapshot.workflow.eventSequence !== sequence) {
            sequence = snapshot.workflow.eventSequence
            subscriber.next({
              id: String(sequence),
              data: {
                type: 'workflow_snapshot',
                workflowId: id,
                sequence,
                snapshot,
                timestamp: new Date().toISOString(),
              },
            })
          }
          if (['completed', 'failed', 'cancelled'].includes(snapshot.workflow.status))
            subscriber.complete()
        } catch (error) {
          if (!subscriber.closed) subscriber.error(error)
        } finally {
          reading = false
        }
      }
      const onNotification = ({ jobId }: { jobId: string }) => {
        if (jobId?.startsWith(`${id}-`)) void publish()
      }
      this.queueEvents.on('progress', onNotification)
      this.queueEvents.on('completed', onNotification)
      this.queueEvents.on('failed', onNotification)
      const heartbeat = setInterval(() => {
        subscriber.next({
          data: { type: 'heartbeat', workflowId: id, timestamp: new Date().toISOString() },
        })
        void publish()
      }, 2000)
      void publish()
      return () => {
        clearInterval(heartbeat)
        this.queueEvents.off('progress', onNotification)
        this.queueEvents.off('completed', onNotification)
        this.queueEvents.off('failed', onNotification)
      }
    })
  }

  private toResponse(workflow: WorkflowDocument): WorkflowResponse {
    return {
      references: workflow.references ?? [],
      generationConfig: workflow.generationConfig,
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
      requirements: workflow.requirements,
      needsComposition: workflow.needsComposition,
      runVersion: workflow.runVersion ?? 0,
      eventSequence: workflow.eventSequence ?? 0,
      currentNode: workflow.currentNode,
      progress: workflow.progress ?? 0,
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

  private async beginAction(workflow: WorkflowDocument, nodeType: WorkflowNodeType) {
    if (workflow.status === 'running' || workflow.status === 'cancelled')
      throw new BadRequestException('任务正在执行或已取消')
    workflow.status = 'running'
    workflow.currentNode = nodeType
    workflow.progress = Math.round(
      (WORKFLOW_NODE_ORDER.indexOf(nodeType) / WORKFLOW_NODE_ORDER.length) * 100,
    )
    workflow.errorMessage = undefined
    await this.saveWorkflow(workflow)
  }
  private async saveWorkflow(workflow: WorkflowDocument, advanceRun = true) {
    await persistWorkflowState(this.workflowModel, workflow, advanceRun)
    if (advanceRun) {
      try {
        await adoptWorkflowNodes(this.workflowNodeModel, workflow)
      } catch (error) {
        if (workflow.status === 'running') {
          workflow.status = 'failed'
          workflow.errorMessage = '任务版本初始化失败，请重试'
          await persistWorkflowState(this.workflowModel, workflow)
        }
        throw error
      }
    }
  }
  private writeNode(workflow: WorkflowDocument, nodeId: unknown, patch: Record<string, unknown>) {
    return persistNodeState(this.workflowNodeModel, this.workflowModel, workflow, nodeId, patch)
  }
  private async writeNodes(
    workflow: WorkflowDocument,
    types: WorkflowNodeType[],
    patch: Record<string, unknown>,
  ) {
    const nodes = await this.workflowNodeModel.find({
      workflowId: workflow._id.toString(),
      type: { $in: types },
    })
    for (const node of nodes) await this.writeNode(workflow, node._id, patch)
  }
  private async resetCompositionNodes(workflow: WorkflowDocument) {
    await this.writeNodes(workflow, ['compose', 'finalEvaluation'], {
      status: 'pending',
      $unset: { output: 1, error: 1, errorMessage: 1 },
    })
  }
  private async queueNode(workflow: WorkflowDocument, nodeType: WorkflowNodeType) {
    try {
      await this.workflowQueue.add(
        RUN_WORKFLOW_JOB,
        { workflowId: workflow._id.toString(), nodeType, runVersion: workflow.runVersion },
        {
          jobId: `${workflow._id.toString()}-r${workflow.runVersion}-${nodeType}`,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      )
    } catch (error) {
      workflow.status = 'failed'
      workflow.currentNode = nodeType
      workflow.errorMessage = '任务入队失败，请重试'
      await this.saveWorkflow(workflow, false)
      throw error
    }
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
    logoRegions: ArtTextRegion[] = [],
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
        else if (
          !logoRegions.some(
            (region) =>
              x >= Math.floor(region.x * width) &&
              x < Math.ceil((region.x + region.width) * width) &&
              y >= Math.floor(region.y * height) &&
              y < Math.ceil((region.y + region.height) * height),
          )
        )
          changedOutside += 1
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
    userId: string,
    entId?: string,
  ) {
    if (ids.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('知识库 ID 格式不正确')
    }
    if (ids.length === 0) return

    const scopeFilters: Record<string, unknown>[] = [
      spaceType === 'personal'
        ? { spaceId: 'personal', ...personalCreatorFilter(userId) }
        : { spaceId },
    ]
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
