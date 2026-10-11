import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type { TaskDashboardData, TaskMetrics, WorkflowResult } from '@brand-flow/contracts'
import { Task, type TaskDocument } from './schemas/task.schema'
import { Submission, type SubmissionDocument } from './schemas/submission.schema'
import { WorkVersion, type WorkVersionDocument } from '../works/schemas/work-version.schema'
import { Workflow, type WorkflowDocument } from '../workflow/schemas/workflow.schema'
import { TasksService } from './tasks.service'
import { ActivityService } from '../org/activity.service'

const ACTIVE_STATUSES = ['pending', 'accepted', 'in_progress', 'submitted', 'reviewing', 'rejected']
const EMPTY_METRICS: TaskMetrics = {
  pending: 0,
  inProgress: 0,
  reviewing: 0,
  overdue: 0,
  completedWeek: 0,
  todo: 0,
  rejected: 0,
  completed: 0,
}
export function taskWeekStart(now: Date): Date {
  const local = new Date(now.getTime() + 8 * 3600000)
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7))
  return new Date(local.getTime() - 8 * 3600000)
}

@Injectable()
export class TasksOperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksOperationsService.name)
  private timer?: ReturnType<typeof setInterval>
  private checking = false
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Submission.name) private readonly submissions: Model<SubmissionDocument>,
    @InjectModel(WorkVersion.name) private readonly versions: Model<WorkVersionDocument>,
    @InjectModel(Workflow.name) private readonly workflows: Model<WorkflowDocument>,
    private readonly domain: TasksService,
    private readonly activity: ActivityService,
  ) {}
  async onModuleInit() {
    await this.tick()
    this.timer = setInterval(() => {
      void this.tick()
    }, 3600000)
    this.timer.unref()
  }
  onModuleDestroy() {
    clearInterval(this.timer)
  }

  async dashboard(userId: string, teamId: string): Promise<TaskDashboardData> {
    const scope = await this.domain.scope(userId, teamId)
    const now = new Date()
    const sumStatus = (statuses: string[]) => ({
      $sum: { $cond: [{ $in: ['$status', statuses] }, 1, 0] },
    })
    const group = {
      $group: {
        _id: null,
        pending: sumStatus(['pending']),
        inProgress: sumStatus(['accepted', 'in_progress']),
        reviewing: sumStatus(['submitted', 'reviewing']),
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$status', ACTIVE_STATUSES] },
                  { $ne: [{ $ifNull: ['$deadline', null] }, null] },
                  { $lt: ['$deadline', now] },
                ],
              },
              1,
              0,
            ],
          },
        },
        completedWeek: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $gte: ['$completedAt', taskWeekStart(now)] },
                ],
              },
              1,
              0,
            ],
          },
        },
        todo: sumStatus(['pending', 'accepted']),
        rejected: sumStatus(['rejected']),
        completed: sumStatus(['completed']),
      },
    }
    const [result] = await this.tasks.aggregate<{ mine: TaskMetrics[]; manager?: TaskMetrics[] }>([
      { $match: this.domain.filter(scope) },
      {
        $facet: {
          mine: [
            { $match: { assigneeId: new Types.ObjectId(userId) } },
            group,
            { $project: { _id: 0 } },
          ],
          ...(scope.permissions.assignTasks ? { manager: [group, { $project: { _id: 0 } }] } : {}),
        },
      },
    ])
    return {
      mine: result?.mine[0] ?? { ...EMPTY_METRICS },
      ...(scope.permissions.assignTasks
        ? { manager: result?.manager?.[0] ?? { ...EMPTY_METRICS } }
        : {}),
    }
  }

  async tick(): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      const now = new Date()
      const reminders = await this.tasks
        .find({
          status: { $in: ACTIVE_STATUSES },
          deadline: { $lte: new Date(now.getTime() + 86400000) },
          $expr: {
            $or: [
              { $ne: [{ $ifNull: ['$deadlineNotifiedFor', null] }, '$deadline'] },
              {
                $and: [
                  { $lte: ['$deadline', now] },
                  { $ne: [{ $ifNull: ['$overdueReportedFor', null] }, '$deadline'] },
                ],
              },
            ],
          },
        })
        .sort({ deadline: 1 })
        .limit(500)
      for (const task of reminders) {
        try {
          await this.tasks.db.transaction(async (session) => {
            const scope = {
              enterpriseId: task.enterpriseId.toString(),
              spaceId: task.teamId.toString(),
              spaceType: 'team' as const,
            }
            const current = await this.tasks.findOne(
              { _id: task.id, enterpriseId: task.enterpriseId, teamId: task.teamId },
              null,
              { session },
            )
            if (
              !current?.deadline ||
              !ACTIVE_STATUSES.includes(current.status) ||
              current.deadline.getTime() !== task.deadline?.getTime()
            )
              return
            const overdue = current.deadline <= now
            const field = overdue ? 'overdueReportedFor' : 'deadlineNotifiedFor'
            if (current[field]?.getTime() === current.deadline.getTime()) return
            const changed = await this.tasks.updateOne(
              {
                _id: task.id,
                enterpriseId: task.enterpriseId,
                teamId: task.teamId,
                status: current.status,
                deadline: current.deadline,
                [field]: { $ne: current.deadline },
              },
              {
                $set: {
                  [field]: current.deadline,
                  ...(overdue ? { deadlineNotifiedFor: current.deadline } : {}),
                },
              },
              { session },
            )
            if (!changed.modifiedCount) return
            const recipients: string[] = []
            for (const id of new Set([
              current.creatorId.toString(),
              current.assigneeId?.toString(),
            ])) {
              if (!id) continue
              try {
                await this.domain.scope(id, current.teamId.toString(), session)
                recipients.push(id)
              } catch (error: unknown) {
                if (!(error instanceof ForbiddenException || error instanceof NotFoundException))
                  throw error
              }
            }
            await this.activity.record(
              null,
              scope,
              overdue ? 'task.overdue' : 'task.deadline_approaching',
              'task',
              task.id,
              { status: current.status },
              session,
              recipients,
            )
          })
        } catch (error: unknown) {
          if (!(error instanceof ForbiddenException || error instanceof NotFoundException))
            throw error
        }
      }
      await this.reconcile(now)
      const [created, completed, overdue, approved, rejected] = await Promise.all([
        this.tasks.countDocuments(),
        this.tasks.countDocuments({ status: 'completed' }),
        this.tasks.countDocuments({ status: { $in: ACTIVE_STATUSES }, deadline: { $lt: now } }),
        this.submissions.countDocuments({ status: 'approved' }),
        this.submissions.countDocuments({ status: 'rejected' }),
      ])
      this.logger.log(
        JSON.stringify({
          metric: 'task_metrics',
          task_created: created,
          task_completed: completed,
          task_overdue: overdue,
          submission_approved: approved,
          submission_rejected: rejected,
        }),
      )
    } catch (error: unknown) {
      this.logger.error(
        JSON.stringify({
          metric: 'task_operations_failure',
          errorType: error instanceof Error ? error.name : 'unknown',
        }),
      )
    } finally {
      this.checking = false
    }
  }

  async reconcile(now = new Date()): Promise<void> {
    const stale = await this.tasks
      .find({ status: 'in_progress', updatedAt: { $lt: new Date(now.getTime() - 300000) } })
      .limit(100)
    for (const task of stale) {
      const workflow =
        task.activeWorkflowId &&
        (await this.workflows.findOne({
          _id: task.activeWorkflowId,
          taskId: task.id,
          spaceId: task.teamId.toString(),
          entId: task.enterpriseId.toString(),
        }))
      if (!workflow) {
        this.logger.error(JSON.stringify({ metric: 'task_execution_missing', taskId: task.id }))
        continue
      }
      if (!task.latestSubmissionId || !['completed', 'failed'].includes(workflow.status)) continue
      const submission = await this.submissions.findOne({
        _id: task.latestSubmissionId,
        taskId: task.id,
        enterpriseId: task.enterpriseId,
        teamId: task.teamId,
        status: 'rejected',
      })
      if (!submission) continue
      const version = await this.versions.findOne({
        _id: submission.workVersionId,
        sourceWorkflowId: workflow._id,
        enterpriseId: task.enterpriseId,
        spaceId: task.teamId.toString(),
      })
      const result = workflow.result as WorkflowResult | undefined
      if (!version || version.sourceRevisionId?.toString() !== result?.revision?.id) continue
      await this.tasks.db.transaction(async (session) => {
        const claimed = await this.workflows.updateOne(
          {
            _id: workflow._id,
            status: workflow.status,
            runVersion: workflow.runVersion,
            eventSequence: workflow.eventSequence,
          },
          { $inc: { eventSequence: 1 } },
          { session },
        )
        if (!claimed.modifiedCount) return
        const recovered = await this.tasks.updateOne(
          {
            _id: task.id,
            enterpriseId: task.enterpriseId,
            teamId: task.teamId,
            status: 'in_progress',
            version: task.version,
            updatedAt: task.updatedAt,
          },
          { $set: { status: 'rejected' }, $inc: { version: 1 } },
          { session },
        )
        if (!recovered.modifiedCount) throw new ConflictException('任务已更新，停止旧状态恢复')
        await this.activity.record(
          null,
          {
            enterpriseId: task.enterpriseId.toString(),
            spaceId: task.teamId.toString(),
            spaceType: 'team',
          },
          'task.resume_recovered',
          'task',
          task.id,
          { status: 'rejected' },
          session,
          [task.assigneeId!.toString()],
        )
      })
    }
  }
}
