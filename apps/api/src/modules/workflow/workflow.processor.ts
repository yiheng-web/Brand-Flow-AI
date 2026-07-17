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

interface RunWorkflowJobData {
  workflowId: string
  nodeType?: WorkflowNodeType
}

@Processor(WORKFLOW_QUEUE)
export class WorkflowProcessor extends WorkerHost {
  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(KnowledgeItem.name)
    private readonly knowledgeItemModel: Model<KnowledgeItemDocument>,
  ) {
    super()
  }

  async process(job: Job<RunWorkflowJobData>): Promise<WorkflowResult | void> {
    if (job.name !== RUN_WORKFLOW_JOB) return

    const workflow = await this.workflowModel.findById(job.data.workflowId)
    if (!workflow) return

    const nodes = await this.workflowNodeModel.find({ workflowId: workflow._id.toString() })
    const nodeMap = new Map(nodes.map((node) => [node.type, node]))
    const startIndex = job.data.nodeType ? WORKFLOW_NODE_ORDER.indexOf(job.data.nodeType) : 0
    if (startIndex < 0) throw new Error(`未知节点类型: ${job.data.nodeType}`)

    let result: WorkflowResult = (workflow.result as WorkflowResult | undefined) ?? {}
    await this.workflowModel.findByIdAndUpdate(workflow._id, {
      status: 'running',
      $unset: { errorMessage: 1 },
    })

    try {
      for (const nodeType of WORKFLOW_NODE_ORDER.slice(startIndex)) {
        const node = nodeMap.get(nodeType)
        if (!node) throw new Error(`工作流缺少节点 ${nodeType}`)

        await this.emitNodeEvent(job, node, 'node_queued')
        await this.workflowNodeModel.findByIdAndUpdate(node._id, {
          status: 'queued',
          $unset: { error: 1, errorMessage: 1, skipReason: 1 },
        })
        await this.emitNodeEvent(job, node, 'node_started')
        await this.workflowNodeModel.findByIdAndUpdate(node._id, {
          status: 'running',
          startedAt: new Date(),
        })

        if (nodeType === 'compose' && result.brief && !result.brief.needsComposition) {
          const selected = result.generate?.candidates.find(
            (candidate) => candidate.id === result.generate?.selectedCandidateId,
          )
          if (!selected) throw new Error('缺少已选择候选图，无法跳过合成并继续')
          result.compose = composeFinalImage(selected, result.brief)
          result.finalImageUrl = result.compose.finalImageUrl
          const reason = '当前需求不需要叠加标题、Logo 或营销文案'
          await this.workflowNodeModel.findByIdAndUpdate(node._id, {
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
          await this.persistProgress(workflow._id.toString(), result)
          continue
        }

        const output = await this.executeNode(nodeType, workflow, result)
        result = output.result
        await this.workflowNodeModel.findByIdAndUpdate(node._id, {
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
        await this.persistProgress(workflow._id.toString(), result)
      }

      await this.workflowModel.findByIdAndUpdate(workflow._id, {
        status: 'completed',
        result,
      })
      return result
    } catch (error) {
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
        await this.workflowNodeModel.findByIdAndUpdate(runningNode._id, {
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
      await this.workflowModel.findByIdAndUpdate(workflow._id, {
        status: 'failed',
        result,
        errorMessage: message,
      })
      throw error
    }
  }

  private async executeNode(
    nodeType: WorkflowNodeType,
    workflow: WorkflowDocument,
    result: WorkflowResult,
  ): Promise<{ result: WorkflowResult; nodeOutput: Record<string, unknown> }> {
    if (nodeType === 'brief') {
      const brief = await createCreativeBrief(workflow.prompt)
      return {
        result: { ...result, brief },
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
      const directions = await createCreativeDirections(result.brief, result.brandConstraint)
      const creativeDirection = { directions, selectedDirectionId: directions[0].id }
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
      const prompt = await createPromptPlan(result.brief, selectedDirection, result.brandConstraint)
      return {
        result: { ...result, prompt },
        nodeOutput: prompt as unknown as Record<string, unknown>,
      }
    }

    if (!result.prompt) throw new Error(`节点 ${nodeType} 缺少 PromptPlan`)

    if (nodeType === 'generate') {
      const startedAt = Date.now()
      const candidates = await generateCandidates(result.prompt)
      if (!candidates.some((candidate) => candidate.imageUrl)) {
        throw new Error('四张候选图均生成失败，请检查生图 Provider 配置或显式开启演示模式')
      }
      const evaluations = sortCandidateEvaluations(
        await evaluateCandidateImages(candidates, result.brandConstraint),
      )
      const selectedCandidateId =
        result.generate?.selectedCandidateId ||
        evaluations.find((evaluation) => evaluation.recommended)?.candidateId ||
        evaluations[0]?.candidateId ||
        candidates.find((candidate) => candidate.imageUrl)?.id
      if (!selectedCandidateId) throw new Error('四张候选图均生成失败')
      const generate = {
        candidates,
        evaluations,
        selectedCandidateId,
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
    const finalEvaluation = await evaluateFinalImage(
      finalImageUrl,
      result.brandConstraint,
      result.brief,
    )
    return {
      result: { ...result, finalEvaluation, finalImageUrl },
      nodeOutput: finalEvaluation as unknown as Record<string, unknown>,
    }
  }

  private async buildConstraintPackage(
    workflow: WorkflowDocument,
  ): Promise<BrandConstraintPackage> {
    const ids = workflow.selectedKnowledgeBaseIds ?? []
    if (ids.length === 0) return { required: [], recommended: [], optional: [], sources: [] }

    const items = await this.knowledgeItemModel
      .find({ knowledgeId: { $in: ids.map((id) => new Types.ObjectId(id)) }, status: 'active' })
      .limit(30)
    return {
      required: [],
      recommended: items.map((item) => ({
        id: item._id.toString(),
        title: item.title,
        description: item.content,
        sourceKnowledgeBaseId: item.knowledgeId.toString(),
        sourceItemId: item._id.toString(),
      })),
      optional: [],
      sources: ids.map((knowledgeBaseId) => ({ knowledgeBaseId })),
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

  private async persistProgress(workflowId: string, result: WorkflowResult) {
    await this.workflowModel.findByIdAndUpdate(workflowId, { result })
  }
}
