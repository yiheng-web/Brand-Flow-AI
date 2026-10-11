import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type { ClientSession } from 'mongoose'
import { canTransitionTask, taskPermissions } from '@brand-flow/contracts'
import type { TaskData, TaskPage, TaskStatus } from '@brand-flow/contracts'
import { assertObjectId } from '@/common/personal-scope'
import { AuthorizationService } from '../org/authorization.service'
import type { AuthorizedSpace } from '../org/authorization.service'
import { ActivityService } from '../org/activity.service'
import { Task, type TaskDocument } from './schemas/task.schema'
import { CreateTaskDto, ListTasksDto, TaskCommandDto, UpdateTaskDto } from './dto/tasks.dto'

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    private readonly authorization: AuthorizationService,
    private readonly activity: ActivityService,
  ) {}

  async scope(userId: string, teamId: string, session?: ClientSession): Promise<AuthorizedSpace> {
    assertObjectId(teamId)
    const scope = await this.authorization.assertCanReadSpace(userId, teamId, session)
    if (scope.spaceType !== 'team') throw new BadRequestException('任务必须归属团队')
    return scope
  }

  filter(scope: AuthorizedSpace) {
    return {
      enterpriseId: new Types.ObjectId(scope.enterpriseId),
      teamId: new Types.ObjectId(scope.spaceId),
    }
  }

  async load(id: string, scope: AuthorizedSpace, session?: ClientSession): Promise<TaskDocument> {
    assertObjectId(id)
    const task = await this.tasks.findOne({ _id: id, ...this.filter(scope) }, null, { session })
    if (!task) throw new NotFoundException('任务不存在')
    return task
  }

  data(task: TaskDocument, userId: string, scope: AuthorizedSpace): TaskData {
    return {
      id: task._id.toString(),
      enterpriseId: task.enterpriseId.toString(),
      teamId: task.teamId.toString(),
      creatorId: task.creatorId.toString(),
      assigneeId: task.assigneeId?.toString(),
      title: task.title,
      description: task.description,
      priority: task.priority,
      deadline: task.deadline?.toISOString(),
      status: task.status,
      version: task.version,
      requirementSnapshot: task.requirementSnapshot,
      activeWorkflowId: task.activeWorkflowId,
      latestSubmissionId: task.latestSubmissionId,
      declineReason: task.declineReason,
      permissions: taskPermissions(scope.role, userId, task.assigneeId?.toString()),
      overdue:
        !!task.deadline &&
        task.deadline < new Date() &&
        !['completed', 'cancelled'].includes(task.status),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }
  }

  async create(userId: string, dto: CreateTaskDto): Promise<TaskData> {
    return this.tasks.db.transaction(async (session) => {
      const scope = await this.scope(userId, dto.teamId, session)
      if (!scope.permissions.assignTasks) throw new ForbiddenException('仅管理员可创建任务')
      if (!dto.title.trim() || !dto.requirementSnapshot?.prompt.trim())
        throw new BadRequestException('标题与创作要求不能为空')
      const [task] = await this.tasks.create(
        [
          {
            ...dto,
            ...this.filter(scope),
            title: dto.title.trim(),
            creatorId: userId,
            status: 'draft',
          },
        ],
        { session },
      )
      await this.activity.record(userId, scope, 'task.created', 'task', task.id, {}, session)
      return this.data(task, userId, scope)
    })
  }

  async list(userId: string, query: ListTasksDto): Promise<TaskPage> {
    const scope = await this.scope(userId, query.teamId)
    const now = new Date()
    const filter = {
      ...this.filter(scope),
      ...(query.view === 'mine' ? { assigneeId: new Types.ObjectId(userId) } : {}),
      ...(query.view === 'created-by-me' ? { creatorId: new Types.ObjectId(userId) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.deadline
        ? {
            deadline:
              query.deadline === 'overdue'
                ? { $lt: now }
                : { $gte: now, $lte: new Date(now.getTime() + 86400000) },
            status: query.status ?? { $nin: ['completed', 'cancelled'] },
          }
        : {}),
    }
    const [tasks, total] = await Promise.all([
      this.tasks
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize),
      this.tasks.countDocuments(filter),
    ])
    return {
      items: tasks.map((task) => this.data(task, userId, scope)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async detail(userId: string, id: string, teamId: string): Promise<TaskData> {
    const scope = await this.scope(userId, teamId)
    return this.data(await this.load(id, scope), userId, scope)
  }

  async update(userId: string, id: string, teamId: string, dto: UpdateTaskDto): Promise<TaskData> {
    return this.tasks.db.transaction(async (session) => {
      const scope = await this.scope(userId, teamId, session)
      const task = await this.load(id, scope, session)
      if (!scope.permissions.assignTasks) throw new ForbiddenException('仅管理员可编辑任务')
      if (task.status !== 'draft') throw new ConflictException('仅草稿可编辑要求')
      if (dto.title !== undefined && !dto.title.trim())
        throw new BadRequestException('标题不能为空')
      const { version, ...changes } = dto
      const updated = await this.tasks.findOneAndUpdate(
        { _id: id, ...this.filter(scope), version, status: 'draft' },
        { $set: changes, $inc: { version: 1 } },
        { new: true, session, runValidators: true },
      )
      if (!updated) throw new ConflictException('任务已变化，请刷新')
      await this.activity.record(userId, scope, 'task.updated', 'task', id, {}, session)
      return this.data(updated, userId, scope)
    })
  }

  async command(
    userId: string,
    id: string,
    dto: TaskCommandDto,
    action: 'assign' | 'accept' | 'decline' | 'cancel',
    assigneeId?: string,
    reason?: string,
  ): Promise<TaskData> {
    return this.tasks.db.transaction(async (session) => {
      const scope = await this.scope(userId, dto.teamId, session)
      const task = await this.load(id, scope, session)
      const permission = taskPermissions(scope.role, userId, task.assigneeId?.toString())
      if (
        !scope.permissions.write ||
        (action === 'accept' || action === 'decline' ? !permission.execute : !permission.manage)
      )
        throw new ForbiddenException('无权执行此任务操作')
      let next: TaskStatus
      if (action === 'assign') {
        if (task.status !== 'draft' || !assigneeId) throw new ConflictException('仅草稿可派发')
        assertObjectId(assigneeId)
        const target = await this.scope(assigneeId, dto.teamId, session)
        if (!target.permissions.write) throw new BadRequestException('负责人必须为可执行成员')
        next = 'pending'
      } else if (action === 'accept' || action === 'decline') {
        if (task.status !== 'pending') throw new ConflictException('任务已被处理')
        if (action === 'decline' && !reason?.trim())
          throw new BadRequestException('拒绝必须填写原因')
        next = action === 'accept' ? 'accepted' : 'draft'
      } else next = 'cancelled'
      if (!canTransitionTask(task.status, next)) throw new ConflictException('非法任务状态转换')
      const updated = await this.tasks.findOneAndUpdate(
        { _id: id, ...this.filter(scope), status: task.status, version: dto.version },
        {
          $set: {
            status: next,
            ...(action === 'assign' ? { assigneeId, declineReason: '' } : {}),
            ...(action === 'decline' ? { declineReason: reason!.trim() } : {}),
          },
          ...(action === 'decline' ? { $unset: { assigneeId: 1 } } : {}),
          $inc: { version: 1 },
        },
        { new: true, session },
      )
      if (!updated) throw new ConflictException('任务已变化，请刷新')
      await this.activity.record(
        userId,
        scope,
        `task.${action}`,
        'task',
        id,
        { status: next },
        session,
        action === 'assign' ? [assigneeId!] : [task.creatorId.toString()],
      )
      return this.data(updated, userId, scope)
    })
  }

  async remove(userId: string, id: string, dto: TaskCommandDto): Promise<{ success: true }> {
    assertObjectId(id)
    return this.tasks.db.transaction(async (session) => {
      const scope = await this.scope(userId, dto.teamId, session)
      if (!scope.permissions.assignTasks) throw new ForbiddenException('仅管理员可删除草稿')
      const result = await this.tasks.deleteOne(
        { _id: id, ...this.filter(scope), status: 'draft', version: dto.version },
        { session },
      )
      if (!result.deletedCount) throw new ConflictException('仅未变化的草稿可删除')
      await this.activity.record(userId, scope, 'task.deleted', 'task', id, {}, session)
      return { success: true }
    })
  }
}
