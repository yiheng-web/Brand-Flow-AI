import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { TaskData } from '@brand-flow/contracts'
import { taskPermissions } from '@brand-flow/contracts'
import { Task, type TaskDocument } from './schemas/task.schema'
import { Workflow, type WorkflowDocument } from '../workflow/schemas/workflow.schema'
import { WorkflowService } from '../workflow/workflow.service'
import { TasksService } from './tasks.service'
import { ActivityService } from '../org/activity.service'
import { TaskCommandDto } from './dto/tasks.dto'

@Injectable()
export class TasksExecutionService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Workflow.name) private readonly workflows: Model<WorkflowDocument>,
    private readonly domain: TasksService,
    private readonly workflow: WorkflowService,
    private readonly activity: ActivityService,
  ) {}

  async start(userId: string, id: string, dto: TaskCommandDto): Promise<TaskData> {
    return this.tasks.db.transaction(async (session) => {
      const scope = await this.domain.scope(userId, dto.teamId, session)
      const task = await this.domain.load(id, scope, session)
      if (
        !scope.permissions.write ||
        !taskPermissions(scope.role, userId, task.assigneeId?.toString()).execute
      )
        throw new ForbiddenException('仅负责人可开始创作')
      if (task.status !== 'accepted' || task.activeWorkflowId || task.version !== dto.version)
        throw new ConflictException('任务已启动或状态已变化')
      const requirements = task.requirementSnapshot
      const created = await this.workflow.create(
        { ...requirements, spaceId: scope.spaceId },
        userId,
        { session, taskId: id, needsComposition: requirements.needsComposition },
      )
      const updated = await this.tasks.findOneAndUpdate(
        {
          _id: id,
          ...this.domain.filter(scope),
          version: dto.version,
          status: 'accepted',
          activeWorkflowId: { $exists: false },
        },
        { $set: { activeWorkflowId: created.id, status: 'in_progress' }, $inc: { version: 1 } },
        { session, new: true },
      )
      if (!updated) throw new ConflictException('任务已变化，请刷新')
      await this.activity.record(
        userId,
        scope,
        'task.started',
        'task',
        id,
        { status: 'in_progress' },
        session,
        [task.creatorId.toString()],
      )
      return this.domain.data(updated, userId, scope)
    })
  }

  async detail(userId: string, id: string, teamId: string): Promise<TaskData> {
    const task = await this.domain.detail(userId, id, teamId)
    if (task.activeWorkflowId) {
      const workflow = await this.workflows
        .findOne({
          _id: task.activeWorkflowId,
          taskId: task.id,
          spaceId: task.teamId,
          entId: task.enterpriseId,
        })
        .lean()
      if (workflow)
        task.progress = {
          status: workflow.status,
          currentNode: workflow.currentNode,
          awaitingAction: workflow.awaitingAction,
          percent: workflow.progress,
          updatedAt: workflow.updatedAt.toISOString(),
          executionError: workflow.errorMessage,
        }
    }
    return task
  }
}
