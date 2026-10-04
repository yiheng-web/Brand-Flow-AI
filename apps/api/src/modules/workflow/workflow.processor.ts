import { Logger } from '@nestjs/common'
import { LimitsService } from '../limits/limits.service'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import {
  composeFinalImage,
  createCreativeBrief,
  createCreativeDirections,
  createPromptPlan,
  evaluateCandidateImages,
  evaluateFinalImage,
  generateCandidates,
  extractReferenceConstraints,
} from '@brand-flow/agent'
import {
  WORKFLOW_NODE_ORDER,
  sortCandidateEvaluations,
  type BrandConstraintPackage,
  type WorkflowNodeType,
  type WorkflowResult,
  type WorkflowSseEvent,
} from '@brand-flow/contracts'
import { Job } from 'bullmq'
import { Model, Types } from 'mongoose'

import { KnowledgeItem, KnowledgeItemDocument } from '../knowledge/schemas/knowledge-item.schema'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import { WorkflowNode, WorkflowNodeDocument } from './schemas/workflow-node.schema'
import { Workflow, WorkflowDocument } from './schemas/workflow.schema'
import { WorkflowRevision, WorkflowRevisionDocument } from './schemas/workflow-revision.schema'
import { StorageService } from '../storage/storage.service'
import { WorkflowReferencesService } from './workflow-references.service'
import {
  trackWorkflow,
  persistWorkflowState,
  persistNodeState,
  StaleWorkflowError,
} from './workflow-state'

interface RunWorkflowJobData {
  workflowId: string
  nodeType?: WorkflowNodeType
  runVersion: number
}

@Processor(WORKFLOW_QUEUE)
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name)
  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(WorkflowRevision.name)
    private readonly workflowRevisionModel: Model<WorkflowRevisionDocument>,
    @InjectModel(KnowledgeItem.name)
    private readonly knowledgeItemModel: Model<KnowledgeItemDocument>,
    private readonly storageService: StorageService,
    private readonly referencesService?: WorkflowReferencesService,
    private readonly limits?: LimitsService,
  ) {
    super()
  }

  async process(job: Job<RunWorkflowJobData>): Promise<WorkflowResult | void> {
    if (job.name !== RUN_WORKFLOW_JOB) return

    const workflow = await this.workflowModel.findById(job.data.workflowId)
    if (
      !workflow ||
      workflow.status !== 'running' ||
      (workflow.runVersion ?? 0) !== job.data.runVersion
    )
      return
    trackWorkflow(workflow)

    const nodes = await this.workflowNodeModel.find({ workflowId: workflow._id.toString() })
    const nodeMap = new Map(nodes.map((node) => [node.type, node]))
    const startIndex = job.data.nodeType ? WORKFLOW_NODE_ORDER.indexOf(job.data.nodeType) : 0
    if (startIndex < 0) throw new Error(`未知节点类型: ${job.data.nodeType}`)

    let result: WorkflowResult = (workflow.result as WorkflowResult | undefined) ?? {}
    result = { ...result, revision: result.revision ?? { round: 0 } }
    await this.saveWorkflow(workflow, {
      status: 'running',
      $unset: { errorMessage: 1 },
    })

    try {
      if (this.limits && !workflow.executionLease) {
        workflow.executionLease = await this.limits.reserve(
          workflow.userId,
          workflow._id.toString(),
        )
        await this.saveWorkflow(workflow, { executionLease: workflow.executionLease })
      }
      for (const nodeType of WORKFLOW_NODE_ORDER.slice(startIndex)) {
        const node = nodeMap.get(nodeType)
        if (!node) throw new Error(`工作流缺少节点 ${nodeType}`)

        workflow.currentNode = nodeType
        await this.emitNodeEvent(job, node, 'node_queued')
        await this.writeNode(workflow, node._id, {
          status: 'queued',
          $unset: { error: 1, errorMessage: 1, skipReason: 1 },
        })
        await this.emitNodeEvent(job, node, 'node_started')
        await this.writeNode(workflow, node._id, {
          status: 'running',
          startedAt: new Date(),
        })

        if (nodeType === 'compose' && result.brief?.needsComposition) {
          await this.writeNode(workflow, node._id, {
            status: 'pending',
            $unset: { output: 1, completedAt: 1 },
          })
          await this.saveWorkflow(workflow, {
            status: 'awaiting_user',
            awaitingAction: 'enter_art_text',
            result,
          })
          await job.updateProgress({
            type: 'workflow_awaiting_user',
            workflowId: workflow._id.toString(),
            action: 'enter_art_text',
            result,
            timestamp: new Date().toISOString(),
          } satisfies WorkflowSseEvent)
          return result
        }

        if (nodeType === 'compose' && result.brief && !result.brief.needsComposition) {
          const selected = result.generate?.candidates.find(
            (candidate) => candidate.id === result.generate?.selectedCandidateId,
          )
          if (!selected) throw new Error('缺少已选择候选图，无法跳过合成并继续')
          result.compose = composeFinalImage(selected, result.brief)
          result.finalImageUrl = result.compose.finalImageUrl
          const reason = '当前需求不需要叠加标题、Logo 或营销文案'
          await this.writeNode(workflow, node._id, {
            status: 'skipped',
            skipReason: reason,
            output: result.compose,
            completedAt: new Date(),
          })
          await job.updateProgress({
            type: 'node_skipped',
            workflowId: workflow._id.toString(),
            nodeId: node._id.toString(),
            nodeType,
            reason,
            timestamp: new Date().toISOString(),
          } satisfies WorkflowSseEvent)
          await this.persistProgress(workflow, result)
          continue
        }

        const startedAt = Date.now()
        this.logger.log(
          JSON.stringify({
            workflowId: workflow._id.toString(),
            node: nodeType,
            revision: result.revision?.round ?? 0,
            providerStatus: 'started',
          }),
        )
        let output: Awaited<ReturnType<WorkflowProcessor['executeNode']>>
        try {
          await this.assertActive(workflow)
          output = await this.executeNode(nodeType, workflow, result)
          this.logger.log(
            JSON.stringify({
              workflowId: workflow._id.toString(),
              node: nodeType,
              revision: result.revision?.round ?? 0,
              duration: Date.now() - startedAt,
              providerStatus: 'completed',
            }),
          )
        } catch (error) {
          this.logger.warn(
            JSON.stringify({
              workflowId: workflow._id.toString(),
              node: nodeType,
              revision: result.revision?.round ?? 0,
              duration: Date.now() - startedAt,
              providerStatus: error instanceof StaleWorkflowError ? 'cancelled_or_stale' : 'failed',
            }),
          )
          throw error
        }
        result = output.result
        await this.writeNode(workflow, node._id, {
          status: 'completed',
          output: output.nodeOutput,
          completedAt: new Date(),
          $unset: { error: 1, errorMessage: 1, skipReason: 1 },
        })
        await job.updateProgress({
          type: 'node_completed',
          workflowId: workflow._id.toString(),
          nodeId: node._id.toString(),
          nodeType,
          output: output.nodeOutput,
          timestamp: new Date().toISOString(),
        } satisfies WorkflowSseEvent)
        workflow.progress = Math.round(
          ((WORKFLOW_NODE_ORDER.indexOf(nodeType) + 1) / WORKFLOW_NODE_ORDER.length) * 100,
        )
        await this.persistProgress(workflow, result)
        if (result.revision?.id) {
          await this.workflowRevisionModel.findOneAndUpdate(
            {
              _id: result.revision.id,
              workflowId: workflow._id,
              status: { $in: ['queued', 'failed'] },
            },
            { result, status: result.finalEvaluation?.passed ? 'completed' : 'queued' },
            { sort: { round: -1 } },
          )
        }

        const awaitingAction =
          nodeType === 'brief'
            ? 'confirm_brief'
            : nodeType === 'creativeDirection'
              ? 'select_direction'
              : nodeType === 'generate'
                ? 'select_candidate'
                : undefined
        if (awaitingAction) {
          await this.saveWorkflow(workflow, {
            status: 'awaiting_user',
            awaitingAction,
            result,
          })
          await job.updateProgress({
            type: 'workflow_awaiting_user',
            workflowId: workflow._id.toString(),
            action: awaitingAction,
            result,
            timestamp: new Date().toISOString(),
          } satisfies WorkflowSseEvent)
          return result
        }
      }

      await this.saveWorkflow(workflow, {
        status: result.finalEvaluation?.passed ? 'completed' : 'awaiting_user',
        result,
        ...(result.finalEvaluation?.passed
          ? { $unset: { awaitingAction: 1 } }
          : { awaitingAction: 'select_candidate' }),
      })
      return result
    } catch (error) {
      if (error instanceof StaleWorkflowError) return
      const current = await this.workflowModel.findById(workflow._id)
      if (!current || current.status !== 'running' || current.runVersion !== job.data.runVersion)
        return
      const message = error instanceof Error ? error.message : '工作流执行失败'
      const runningNode = await this.workflowNodeModel.findOne({
        workflowId: workflow._id.toString(),
        status: { $in: ['queued', 'running'] },
      })
      if (runningNode) {
        const structuredError = {
          code: 'NODE_EXECUTION_FAILED',
          message,
          retryable: true,
        }
        await this.writeNode(workflow, runningNode._id, {
          status: 'failed',
          error: structuredError,
          errorMessage: message,
          completedAt: new Date(),
        })
        await job.updateProgress({
          type: 'node_failed',
          workflowId: workflow._id.toString(),
          nodeId: runningNode._id.toString(),
          nodeType: runningNode.type,
          error: structuredError,
          timestamp: new Date().toISOString(),
        } satisfies WorkflowSseEvent)
      }
      await this.saveWorkflow(workflow, {
        status: 'failed',
        result,
        errorMessage: message,
      })
      if (result.revision?.id)
        await this.workflowRevisionModel.findOneAndUpdate(
          { workflowId: workflow._id, _id: result.revision.id, status: 'queued' },
          { status: 'failed' },
        )
      throw error
    }
  }

  private async executeNode(
    nodeType: WorkflowNodeType,
    workflow: WorkflowDocument,
    result: WorkflowResult,
  ): Promise<{ result: WorkflowResult; nodeOutput: Record<string, unknown> }> {
    if (nodeType === 'brief') {
      const executionReferences = workflow.references?.length
        ? await this.referencesService!.forExecution(workflow.references, workflow.userId)
        : []
      const analyzed = await Promise.all(executionReferences.map(extractReferenceConstraints))
      const references = analyzed.map((reference) => ({ ...reference, imageUrl: '' }))
      const generatedBrief = await this.executeWithRetry(
        workflow,
        nodeType,
        () => createCreativeBrief(workflow.prompt, workflow.requirements, references),
        3,
      )
      const brief = {
        ...generatedBrief,
        needsComposition: workflow.needsComposition ?? generatedBrief.needsComposition,
      }
      const briefReview = {
        status: 'pending' as const,
        source: 'generated' as const,
        version: (result.briefReview?.version ?? 0) + 1,
      }
      return {
        result: { ...result, references, brief, briefReview },
        nodeOutput: brief as unknown as Record<string, unknown>,
      }
    }

    if (nodeType === 'brandConstraint') {
      const brandConstraint = await this.buildConstraintPackage(workflow)
      return {
        result: { ...result, brandConstraint },
        nodeOutput: brandConstraint as unknown as Record<string, unknown>,
      }
    }

    if (!result.brief || !result.brandConstraint) {
      throw new Error(`节点 ${nodeType} 缺少上游 Brief 或品牌约束`)
    }

    if (nodeType === 'creativeDirection') {
      const directions = await this.executeWithRetry(
        workflow,
        nodeType,
        () => createCreativeDirections(result.brief!, result.brandConstraint!),
        3,
      )
      const creativeDirection = { directions, selectedDirectionId: '' }
      return {
        result: { ...result, creativeDirection },
        nodeOutput: creativeDirection as unknown as Record<string, unknown>,
      }
    }

    const selectedDirection = result.creativeDirection?.directions.find(
      (direction) => direction.id === result.creativeDirection?.selectedDirectionId,
    )
    if (!selectedDirection) throw new Error(`节点 ${nodeType} 缺少已选择的创意方案`)

    if (nodeType === 'prompt') {
      const prompt = await this.executeWithRetry(
        workflow,
        nodeType,
        () =>
          createPromptPlan(
            result.brief!,
            selectedDirection,
            result.brandConstraint!,
            result.references,
          ),
        3,
      )
      if (workflow.requirements?.aspectRatio) {
        prompt.generationConfig = { aspectRatio: workflow.requirements.aspectRatio }
      }
      if (workflow.generationConfig)
        prompt.generationConfig =
          workflow.generationConfig.aspectRatio && workflow.generationConfig.width === undefined
            ? { seed: prompt.generationConfig.seed, ...workflow.generationConfig }
            : { ...prompt.generationConfig, ...workflow.generationConfig }
      return {
        result: { ...result, prompt },
        nodeOutput: prompt as unknown as Record<string, unknown>,
      }
    }

    if (!result.prompt) throw new Error(`节点 ${nodeType} 缺少 PromptPlan`)

    if (nodeType === 'generate') {
      const startedAt = Date.now()
      const reusableCandidates = result.generate?.candidates
      const canReusePersistedCandidates =
        reusableCandidates?.length === 4 &&
        reusableCandidates.every((candidate) => typeof candidate.metadata?.objectKey === 'string')
      const candidates = canReusePersistedCandidates
        ? await Promise.all(
            reusableCandidates.map(async (candidate) => ({
              ...candidate,
              imageUrl: await this.storageService.getSignedUrl(
                candidate.metadata?.objectKey as string,
              ),
            })),
          )
        : await this.generateWithQuota(workflow, result.prompt)
      if (!candidates.some((candidate) => candidate.imageUrl)) {
        throw new Error('四张候选图均生成失败，请检查生图 Provider 配置或显式开启演示模式')
      }
      const checkpoint = {
        candidates,
        evaluations: [],
        selectedCandidateId: '',
        durationMs: Date.now() - startedAt,
      }
      // 生图已付费且已落 MinIO 后立即检查点，质检失败时可只重跑质检，避免重复生图。
      const checkpointResult = { ...result, generate: checkpoint }
      await this.persistProgress(workflow, checkpointResult)
      const checkpointNode = await this.workflowNodeModel.findOne({
        workflowId: workflow._id.toString(),
        type: 'generate',
      })
      if (!checkpointNode) throw new Error('缺少生成节点检查点')
      await this.writeNode(workflow, checkpointNode._id, { output: checkpoint })
      const evaluations = sortCandidateEvaluations(
        await this.executeWithRetry(
          workflow,
          nodeType,
          () => evaluateCandidateImages(candidates, result.brandConstraint!),
          2,
        ),
      )
      const generate = {
        candidates,
        evaluations,
        selectedCandidateId: '',
        durationMs: Date.now() - startedAt,
      }
      return {
        result: { ...result, generate },
        nodeOutput: generate as unknown as Record<string, unknown>,
      }
    }

    const selectedCandidate = result.generate?.candidates.find(
      (candidate) => candidate.id === result.generate?.selectedCandidateId,
    )
    if (!selectedCandidate) throw new Error(`节点 ${nodeType} 缺少已选择候选图`)

    if (nodeType === 'compose') {
      const compose = composeFinalImage(selectedCandidate, result.brief)
      return {
        result: { ...result, compose, finalImageUrl: compose.finalImageUrl },
        nodeOutput: compose as unknown as Record<string, unknown>,
      }
    }

    const finalImageUrl = result.compose?.finalImageUrl || selectedCandidate.imageUrl
    const finalEvaluation = await this.executeWithRetry(
      workflow,
      nodeType,
      () => evaluateFinalImage(finalImageUrl, result.brandConstraint!, result.brief!),
      3,
    )
    return {
      result: { ...result, finalEvaluation, finalImageUrl },
      nodeOutput: finalEvaluation as unknown as Record<string, unknown>,
    }
  }

  private async assertActive(workflow: WorkflowDocument) {
    const active = await this.workflowModel.exists({
      _id: workflow._id,
      status: 'running',
      runVersion: workflow.runVersion,
    })
    if (!active) throw new StaleWorkflowError()
    if (workflow.executionLease) await this.limits?.renew(workflow.userId, workflow.executionLease)
  }

  private async generateWithQuota(
    workflow: WorkflowDocument,
    prompt: NonNullable<WorkflowResult['prompt']>,
  ) {
    await this.assertActive(workflow)
    await this.limits?.images(workflow.userId, 4)
    await this.assertActive(workflow)
    return this.persistGeneratedCandidates(workflow, await generateCandidates(prompt))
  }

  private async executeWithRetry<T>(
    workflow: WorkflowDocument,
    nodeType: WorkflowNodeType,
    operation: () => Promise<T>,
    maxAttempts: number,
  ): Promise<T> {
    maxAttempts = Math.min(maxAttempts, this.limits?.providerMaxAttempts ?? maxAttempts)
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.assertActive(workflow)
      try {
        return await operation()
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        const retryable =
          /timeout|timed?\s*out|超时|abort|provider|network|fetch|json|解析|429|502|503|504/i.test(
            message,
          )
        if (!retryable || attempt === maxAttempts) break
        await new Promise((resolve) => setTimeout(resolve, attempt * 250))
      }
    }
    const detail = lastError instanceof Error ? lastError.message : `${nodeType} 执行失败`
    const message = /429/.test(detail)
      ? '模型服务请求过于频繁（HTTP 429），请稍后重试'
      : /timeout|timed?\s*out|超时|abort/i.test(detail)
        ? '模型服务响应超时，请重试继续'
        : detail
    throw new Error(`${message}（最多尝试 ${maxAttempts} 次）`)
  }

  private async buildConstraintPackage(
    workflow: WorkflowDocument,
  ): Promise<BrandConstraintPackage> {
    const ids = workflow.selectedKnowledgeBaseIds ?? []
    if (ids.length === 0) return { required: [], recommended: [], optional: [], sources: [] }

    const filter = {
      knowledgeId: { $in: ids.map((id) => new Types.ObjectId(id)) },
      status: 'active',
    }
    // 强制规则完整读取，普通参考按创建时间和 ID 稳定排序，各最多 30 条。
    const required = await this.knowledgeItemModel
      .find({ ...filter, constraintLevel: 'required' })
      .sort({ createdAt: 1, _id: 1 })
    const recommended = await this.knowledgeItemModel
      .find({
        ...filter,
        $or: [{ constraintLevel: 'recommended' }, { constraintLevel: { $exists: false } }],
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(30)
    const optional = await this.knowledgeItemModel
      .find({ ...filter, constraintLevel: 'optional' })
      .sort({ createdAt: 1, _id: 1 })
      .limit(30)
    const items = [...required, ...recommended, ...optional]
    const mapped = items.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      description: item.content,
      sourceKnowledgeBaseId: item.knowledgeId.toString(),
      sourceItemId: item._id.toString(),
    }))
    return {
      required: mapped.filter((_, index) => items[index].constraintLevel === 'required'),
      recommended: mapped.filter(
        (_, index) =>
          !items[index].constraintLevel || items[index].constraintLevel === 'recommended',
      ),
      optional: mapped.filter((_, index) => items[index].constraintLevel === 'optional'),
      sources: mapped.map((item) => ({
        knowledgeBaseId: item.sourceKnowledgeBaseId,
        itemId: item.sourceItemId,
        title: item.title,
      })),
    }
  }

  private async emitNodeEvent(
    job: Job<RunWorkflowJobData>,
    node: WorkflowNodeDocument,
    type: 'node_queued' | 'node_started',
  ) {
    await job.updateProgress({
      type,
      workflowId: node.workflowId.toString(),
      nodeId: node._id.toString(),
      nodeType: node.type,
      timestamp: new Date().toISOString(),
    } satisfies WorkflowSseEvent)
  }

  private async saveWorkflow(workflow: WorkflowDocument, patch: Record<string, unknown>) {
    const { $unset, ...fields } = patch
    Object.assign(workflow, fields)
    if ($unset && typeof $unset === 'object')
      for (const key of Object.keys($unset)) Reflect.set(workflow, key, undefined)
    await persistWorkflowState(this.workflowModel, workflow)
    if (workflow.status !== 'running')
      await this.limits?.release(workflow.userId, workflow.executionLease)
  }
  private writeNode(workflow: WorkflowDocument, nodeId: unknown, patch: Record<string, unknown>) {
    return persistNodeState(this.workflowNodeModel, this.workflowModel, workflow, nodeId, patch)
  }
  private async persistProgress(workflow: WorkflowDocument, result: WorkflowResult) {
    await this.saveWorkflow(workflow, { result })
  }

  private async persistGeneratedCandidates(
    workflow: WorkflowDocument,
    candidates: Awaited<ReturnType<typeof generateCandidates>>,
  ) {
    const uploadedKeys: string[] = []
    try {
      return await Promise.all(
        candidates.map(async (candidate) => {
          if (!candidate.imageUrl) return candidate
          if (!/^[a-zA-Z0-9_-]+$/.test(candidate.id)) throw new Error('候选图 ID 不合法')
          const objectKey = `workflows/${workflow.userId}/${workflow._id.toString()}/runs/${workflow.runVersion}/candidates/${candidate.id}.png`
          await this.storageService.importRemotePng(candidate.imageUrl, {
            key: objectKey,
            metadata: {
              workflowId: workflow._id.toString(),
              candidateId: candidate.id,
              provider: 'siliconflow',
            },
          })
          uploadedKeys.push(objectKey)
          return {
            ...candidate,
            imageUrl: await this.storageService.getSignedUrl(objectKey),
            metadata: {
              ...candidate.metadata,
              objectKey,
              persisted: true,
              revisionId: (workflow.result as WorkflowResult | undefined)?.revision?.id,
              revisionRound: (workflow.result as WorkflowResult | undefined)?.revision?.round ?? 0,
            },
          }
        }),
      )
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) => this.storageService.deleteObject(key).catch(() => undefined)),
      )
      throw error
    }
  }
}
