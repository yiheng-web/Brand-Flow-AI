import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { createAgentGraph, AgentStateType } from '@brand-flow/agent'
import { Job } from 'bullmq'
import { Model } from 'mongoose'
import {
  AGENT_NODE_TO_WORKFLOW_NODE,
  DEFAULT_NODE_STATES,
  RUN_WORKFLOW_JOB,
  WORKFLOW_QUEUE,
  type WorkflowNodeId,
} from './workflow.constants'
import { Workflow, WorkflowDocument } from './schemas/workflow.schema'

interface RunWorkflowJobData {
  workflowId: string
  rerunFromNodeId?: WorkflowNodeId
}

@Processor(WORKFLOW_QUEUE)
export class WorkflowProcessor extends WorkerHost {
  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
  ) {
    super()
  }

  async process(job: Job<RunWorkflowJobData>): Promise<AgentStateType | void> {
    if (job.name !== RUN_WORKFLOW_JOB) return

    const workflow = await this.workflowModel.findById(job.data.workflowId)
    if (!workflow) return

    await this.workflowModel.findByIdAndUpdate(workflow._id, {
      status: 'running',
      nodeStates: {
        ...DEFAULT_NODE_STATES,
        ...(workflow.nodeStates ?? {}),
      },
      $unset: { errorMessage: 1 },
    })

    try {
      const graph = createAgentGraph()
      const previousState =
        workflow.result && typeof workflow.result === 'object'
          ? (workflow.result as Partial<AgentStateType>)
          : {}
      const sessionState =
        workflow.sessionContext && typeof workflow.sessionContext === 'object'
          ? (workflow.sessionContext as Partial<AgentStateType>)
          : {}
      const initialState: Partial<AgentStateType> = {
        ...previousState,
        ...sessionState,
        userQuery: workflow.prompt,
        context: {
          ...(workflow.sessionContext ?? {}),
          workflowId: workflow._id.toString(),
          spaceId: workflow.spaceId,
          rerunFromNodeId: job.data.rerunFromNodeId,
        },
        retryCount: 0,
        nodeStates: {
          ...DEFAULT_NODE_STATES,
          ...(workflow.nodeStates ?? {}),
        },
        status: 'running',
      }

      let finalState: Partial<AgentStateType> = { ...initialState }

      const stream = await graph.stream(initialState)
      for await (const chunk of stream) {
        const [agentNodeName, nodeOutput] = Object.entries(chunk)[0] ?? []
        const workflowNodeId = agentNodeName
          ? AGENT_NODE_TO_WORKFLOW_NODE[agentNodeName]
          : undefined

        if (workflowNodeId) {
          await job.updateProgress({
            type: 'node_started',
            workflowId: workflow._id.toString(),
            nodeId: workflowNodeId,
          })
        }

        finalState = {
          ...finalState,
          ...(nodeOutput as Partial<AgentStateType>),
        }

        await this.workflowModel.findByIdAndUpdate(workflow._id, {
          activeNodeId: finalState.activeNodeId,
          nodeStates: finalState.nodeStates,
          sessionContext: finalState,
          result: finalState,
        })

        await job.updateProgress({
          type: finalState.status === 'failed' ? 'node_failed' : 'node_completed',
          workflowId: workflow._id.toString(),
          nodeId: workflowNodeId,
          data: nodeOutput,
        })

        if (workflowNodeId === 'eval' && finalState.evaluationReport) {
          await job.updateProgress({
            type: 'evaluation_thinking',
            workflowId: workflow._id.toString(),
            nodeId: workflowNodeId,
            data: finalState.evaluationReport,
          })
        }
      }

      const isSuccess = finalState.status === 'success'

      await this.workflowModel.findByIdAndUpdate(workflow._id, {
        status: isSuccess ? 'completed' : 'failed',
        result: finalState,
        sessionContext: finalState,
        nodeStates: finalState.nodeStates,
        activeNodeId: finalState.activeNodeId,
        $unset: { errorMessage: 1 },
      })

      await job.updateProgress({
        type: 'workflow_completed',
        workflowId: workflow._id.toString(),
        data: finalState,
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
