import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { createAgentGraph, AgentStateType } from '@brand-flow/agent'
import { Job } from 'bullmq'
import { Model } from 'mongoose'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import { Workflow, WorkflowDocument } from './schemas/workflow.schema'

interface RunWorkflowJobData {
  workflowId: string
  spaceType: 'personal' | 'team' | 'enterprise'
  selectedKnowledgeBaseIds?: string[]
}

@Processor(WORKFLOW_QUEUE)
export class WorkflowProcessor extends WorkerHost {
  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel('WorkflowNode')
    private readonly workflowNodeModel: Model<any>,
  ) {
    super()
  }

  async process(job: Job<RunWorkflowJobData>): Promise<AgentStateType | void> {
    const workflow = await this.workflowModel.findById(job.data.workflowId)
    if (!workflow) return

    await this.workflowModel.findByIdAndUpdate(workflow._id, {
      status: 'running',
      $unset: { errorMessage: 1 },
    })

    let currentNodeType: string | undefined
    try {
      // 获取当前所有的节点数据
      const nodes = await this.workflowNodeModel.find({ workflowId: workflow._id.toString() })

      const nodeOrder = [
        'brief',
        'brand_constraint',
        'creative_direction',
        'prompt',
        'image_generation',
        'composition',
        'brand_evaluation',
      ]

      // 如果是单节点重跑任务 (RUN_NODE_xxx)，则需要跳过在它之前的所有节点
      let skipNodes: string[] = []
      if (job.name.startsWith('RUN_NODE_')) {
        const targetNode = job.name.replace('RUN_NODE_', '').toLowerCase() // e.g. RUN_NODE_KNOWLEDGENODE -> knowledgenode
        // 找出原始的驼峰名称
        const realTargetNode = nodeOrder.find((n) => n.toLowerCase() === targetNode)
        if (realTargetNode) {
          const index = nodeOrder.indexOf(realTargetNode)
          if (index > 0) {
            skipNodes = nodeOrder.slice(0, index)
          }
        }
      }

      const briefNode = nodes.find((n) => n.type === 'brief')
      const brandConstraintNode = nodes.find((n) => n.type === 'brand_constraint')
      const creativeDirectionNode = nodes.find((n) => n.type === 'creative_direction')
      const promptNode = nodes.find((n) => n.type === 'prompt')
      const imageGenerationNode = nodes.find((n) => n.type === 'image_generation')
      const compositionNode = nodes.find((n) => n.type === 'composition')
      const brandEvaluationNode = nodes.find((n) => n.type === 'brand_evaluation')

      const graph = createAgentGraph()
      const initialState: any = {
        userQuery: workflow.prompt,
        context: {
          spaceId: workflow.spaceId,
          spaceType: job.data.spaceType,
          enterpriseId: workflow.entId,
          selectedKnowledgeBaseIds: job.data.selectedKnowledgeBaseIds,
          skipNodes, // 传入跳过列表给 Agent 节点
        },
        // 将已经被跳过节点（或者用户手动修改过）的数据重新灌入初始状态
        creativeBrief: briefNode?.output ? (briefNode.output as any) : undefined,
        brandConstraintPackage: brandConstraintNode?.output
          ? (brandConstraintNode.output as any)
          : undefined,
        creativeDirections: creativeDirectionNode?.output
          ? (creativeDirectionNode.output as any)
          : undefined,
        promptPlan: promptNode?.output ? (promptNode.output as any) : undefined,
        generatedImages: imageGenerationNode?.output
          ? (imageGenerationNode.output as any)
          : undefined,
        compositionResult: compositionNode?.output ? (compositionNode.output as any) : undefined,
        evaluationResult: brandEvaluationNode?.output
          ? (brandEvaluationNode.output as any)
          : undefined,
        retryCount: 0,
        status: 'running',
      }

      let finalState: any = { ...initialState }

      const expectedNodesToRun = nodeOrder.slice(skipNodes.length)
      currentNodeType = expectedNodesToRun[0]

      if (currentNodeType) {
        await job.updateProgress({ type: 'node_started', nodeType: currentNodeType })
      }

      // 使用 stream 保留流式进度输出，并通过浅合并来聚合所有的状态
      const stream = await graph.stream(initialState)
      for await (const chunk of stream) {
        const nodeType = Object.keys(chunk)[0]
        const update = Object.values(chunk)[0] as Partial<AgentStateType>

        if (update.status === 'failed' || update.error) {
          await job.updateProgress({
            type: 'node_failed',
            nodeType,
            error: update.error || 'Unknown error',
          })
        } else if (skipNodes.includes(nodeType) || (update as any).status === 'skipped') {
          await job.updateProgress({ type: 'node_skipped', nodeType })
        } else {
          await job.updateProgress({ type: 'node_completed', nodeType, data: update })
        }

        finalState = { ...finalState, ...update }

        // 查找当前节点在 expectedNodesToRun 中的位置，以推送下一个节点的 started 事件
        const chunkIndex = expectedNodesToRun.indexOf(nodeType)
        if (
          chunkIndex !== -1 &&
          chunkIndex + 1 < expectedNodesToRun.length &&
          update.status !== 'failed' &&
          !update.error
        ) {
          currentNodeType = expectedNodesToRun[chunkIndex + 1]
          await job.updateProgress({ type: 'node_started', nodeType: currentNodeType })
        }

        // 将真实的产物数据同步至数据库的节点记录中（跳过的节点不进行覆盖更新）
        if (nodeType && nodeType !== '__end__' && !skipNodes.includes(nodeType)) {
          let outputData = {}
          if (nodeType === 'brief' && (update as any).creativeBrief)
            outputData = (update as any).creativeBrief
          else if (nodeType === 'brand_constraint' && (update as any).brandConstraintPackage)
            outputData = (update as any).brandConstraintPackage
          else if (nodeType === 'creative_direction' && (update as any).creativeDirections)
            outputData = (update as any).creativeDirections
          else if (nodeType === 'prompt' && (update as any).promptPlan)
            outputData = (update as any).promptPlan
          else if (nodeType === 'image_generation' && (update as any).generatedImages)
            outputData = (update as any).generatedImages
          else if (nodeType === 'composition' && (update as any).compositionResult)
            outputData = (update as any).compositionResult
          else if (nodeType === 'brand_evaluation' && update.evaluationResult)
            outputData = update.evaluationResult

          await this.workflowNodeModel.findOneAndUpdate(
            { workflowId: workflow._id.toString(), type: nodeType },
            {
              $set: {
                status:
                  update.status === 'success'
                    ? 'completed'
                    : update.status === 'failed'
                      ? 'failed'
                      : (update as any).status === 'skipped'
                        ? 'skipped'
                        : 'running',
                output: outputData,
                ...((update as any).skipReason ? { skipReason: (update as any).skipReason } : {}),
              },
            },
          )
        }
      }

      // ✅ 直接使用 Agent 返回的 status，不再自行二次判定
      const isSuccess = finalState?.status === 'success'

      await this.workflowModel.findByIdAndUpdate(workflow._id, {
        status: isSuccess ? 'completed' : 'failed',
        result: finalState as AgentStateType,
        // ✅ 如果有 error，也一并写入
        ...(finalState?.error
          ? { errorMessage: finalState.error }
          : { $unset: { errorMessage: 1 } }),
      })

      return finalState as AgentStateType
    } catch (error) {
      if (currentNodeType) {
        await job.updateProgress({
          type: 'node_failed',
          nodeType: currentNodeType,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      await this.workflowModel.findByIdAndUpdate(workflow._id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '工作流执行失败',
      })
      throw error
    }
  }
}
