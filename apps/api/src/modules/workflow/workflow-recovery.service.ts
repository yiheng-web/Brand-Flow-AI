import { Injectable, Logger } from '@nestjs/common'
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectQueue } from '@nestjs/bullmq'
import type { Model } from 'mongoose'
import type { Queue } from 'bullmq'
import { WORKFLOW_NODE_ORDER } from '@brand-flow/contracts'
import { User, type UserDocument } from '../org/schemas/user.schema'
import { LimitsService } from '../limits/limits.service'
import { WORKFLOW_QUEUE } from './workflow.constants'
import { Workflow, type WorkflowDocument } from './schemas/workflow.schema'
import { WorkflowNode, type WorkflowNodeDocument } from './schemas/workflow-node.schema'
import { trackWorkflow, persistWorkflowState, StaleWorkflowError } from './workflow-state'

@Injectable()
export class WorkflowRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowRecoveryService.name)
  private timer?: ReturnType<typeof setInterval>
  private checking = false

  constructor(
    @InjectModel(Workflow.name) private readonly workflows: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name) private readonly nodes: Model<WorkflowNodeDocument>,
    @InjectQueue(WORKFLOW_QUEUE) private readonly queue: Queue,
    private readonly limits: LimitsService,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  async onModuleInit() {
    await this.reconcile()
    this.timer = setInterval(() => {
      void this.reconcile()
    }, 60000)
    this.timer.unref()
  }
  onModuleDestroy() {
    clearInterval(this.timer)
  }

  async reconcile() {
    if (this.checking) return
    this.checking = true
    try {
      // 崩溃可能发生在名额分配后、工作流 CAS 前；保留宽限期，避免清理并发中的新分配。
      const users = await this.users
        .find({ 'runningWorkflowLeases.0': { $exists: true } })
        .select('_id runningWorkflowLeases')
      for (const user of users) {
        for (const token of user.runningWorkflowLeases) {
          const [id, allocatedAt] = token.split('/')
          if (Date.now() - Number(allocatedAt) < this.limits.leaseMs) continue
          if (
            !(await this.workflows.exists({
              _id: id,
              userId: user._id.toString(),
              status: 'running',
              executionLease: token,
            }))
          )
            await this.limits.release(user._id.toString(), token)
        }
      }
      const workflows = await this.workflows
        .find({ status: 'running', updatedAt: { $lt: new Date(Date.now() - this.limits.leaseMs) } })
        .sort({ updatedAt: 1 })
        .limit(100)
      for (const workflow of workflows) {
        const jobs = await Promise.all(
          WORKFLOW_NODE_ORDER.map((node) =>
            this.queue.getJob(`${workflow._id.toString()}-r${workflow.runVersion}-${node}`),
          ),
        )
        const states = await Promise.all(jobs.map((job) => job?.getState()))
        if (
          states.some(
            (state) =>
              state &&
              ['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'].includes(state),
          )
        )
          continue
        trackWorkflow(workflow)
        workflow.status = 'failed'
        workflow.errorMessage = '任务执行中断，已恢复检查点，请重试继续'
        try {
          await persistWorkflowState(this.workflows, workflow)
        } catch (error) {
          if (error instanceof StaleWorkflowError) continue
          throw error
        }
        await this.nodes.updateMany(
          {
            workflowId: workflow._id.toString(),
            runVersion: workflow.runVersion,
            status: { $in: ['queued', 'running'] },
          },
          { $set: { status: 'failed', errorMessage: workflow.errorMessage } },
        )
        await this.limits.release(workflow.userId, workflow.executionLease)
        this.logger.warn(
          JSON.stringify({
            workflowId: workflow._id.toString(),
            node: workflow.currentNode,
            revision: workflow.runVersion,
            providerStatus: 'recovered_interruption',
          }),
        )
      }
    } catch {
      this.logger.warn('任务对账暂不可用，将在下一轮重试')
    } finally {
      this.checking = false
    }
  }
}
