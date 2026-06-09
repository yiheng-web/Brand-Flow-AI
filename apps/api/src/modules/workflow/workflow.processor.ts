import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { createAgentGraph, AgentStateType } from '@brand-flow/agent'
import { Job } from 'bullmq'
import { Model } from 'mongoose'
import { RUN_WORKFLOW_JOB, WORKFLOW_QUEUE } from './workflow.constants'
import { Workflow, WorkflowDocument } from './schemas/workflow.schema'

interface RunWorkflowJobData {
  workflowId: string
  knowledgeIds?: string[]
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

    try {
      // 获取当前所有的节点数据
      const nodes = await this.workflowNodeModel.find({ workflowId: workflow._id.toString() })

      const nodeOrder = [
        'intentNode',
        'knowledgeNode',
        'promptNode',
        'generateNode',
        'evaluateNode',
        'finishNode',
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

      const intentNode = nodes.find((n) => n.type === 'intentNode')
      const knowledgeNode = nodes.find((n) => n.type === 'knowledgeNode')
      const promptNode = nodes.find((n) => n.type === 'promptNode')
      const generateNode = nodes.find((n) => n.type === 'generateNode')
      const evaluateNode = nodes.find((n) => n.type === 'evaluateNode')

      const graph = createAgentGraph()
      const knowledgeIds = job.data.knowledgeIds?.length
        ? job.data.knowledgeIds
        : workflow.knowledgeIds
      const initialState: Partial<AgentStateType> = {
        userQuery: workflow.prompt,
        context: {
          spaceId: workflow.spaceId,
          workspaceId: workflow.workspaceId,
          knowledgeId: knowledgeIds[0],
          knowledgeIds,
          skipNodes, // 传入跳过列表给 Agent 节点
        },
        // 将已经被跳过节点（或者用户手动修改过）的数据重新灌入初始状态
        intentResult: intentNode?.output?.intent ? (intentNode.output as any) : undefined,
        knowledgeContext: knowledgeNode?.output?.knowledgeContext
          ? (knowledgeNode.output.knowledgeContext as any)
          : undefined,
        promptResult: promptNode?.output?.systemPrompt ? (promptNode.output as any) : undefined,
        generateResult: generateNode?.output?.content ? (generateNode.output as any) : undefined,
        evaluationResult: evaluateNode?.output?.overallScore
          ? (evaluateNode.output as any)
          : undefined,
        retryCount: 0,
        status: 'running',
      }

      let finalState: Partial<AgentStateType> = { ...initialState }

      // 使用 stream 保留流式进度输出，并通过浅合并来聚合所有的状态
      const stream = await graph.stream(initialState)
      for await (const chunk of stream) {
        const nodeType = Object.keys(chunk)[0]
        const update = Object.values(chunk)[0] as Partial<AgentStateType>

        if (skipNodes.includes(nodeType)) {
          await job.updateProgress({ type: 'node_skipped', nodeType })
        } else {
          await job.updateProgress({ type: 'node_completed', nodeType, data: update })
        }

        finalState = { ...finalState, ...update }

        // 将真实的产物数据同步至数据库的节点记录中（跳过的节点不进行覆盖更新）
        if (nodeType && nodeType !== '__end__' && !skipNodes.includes(nodeType)) {
          let outputData = {}
          if (nodeType === 'intentNode' && update.intentResult) outputData = update.intentResult
          else if (nodeType === 'knowledgeNode' && update.knowledgeContext)
            outputData = { knowledgeContext: update.knowledgeContext }
          else if (nodeType === 'promptNode' && update.promptResult)
            outputData = update.promptResult
          else if (nodeType === 'generateNode' && update.generateResult)
            outputData = update.generateResult
          else if (nodeType === 'evaluateNode' && update.evaluationResult)
            outputData = update.evaluationResult
          else if (nodeType === 'finishNode') outputData = { status: update.status }

          await this.workflowNodeModel.findOneAndUpdate(
            { workflowId: workflow._id.toString(), type: nodeType },
            {
              $set: {
                status:
                  update.status === 'success'
                    ? 'completed'
                    : update.status === 'failed'
                      ? 'failed'
                      : 'running',
                output: outputData,
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
      await this.workflowModel.findByIdAndUpdate(workflow._id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '工作流执行失败',
      })
      throw error
    }
  }
}
