import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { taskPermissions } from '@brand-flow/contracts'
import type {
  SubmissionData,
  TaskData,
  TaskDeliverable,
  WorkflowResult,
} from '@brand-flow/contracts'
import { Task, type TaskDocument } from './schemas/task.schema'
import { Submission, type SubmissionDocument } from './schemas/submission.schema'
import { Work, type WorkDocument } from '../works/schemas/work.schema'
import { WorkVersion, type WorkVersionDocument } from '../works/schemas/work-version.schema'
import { Workflow, type WorkflowDocument } from '../workflow/schemas/workflow.schema'
import { WorkflowService } from '../workflow/workflow.service'
import { TasksService } from './tasks.service'
import { ActivityService } from '../org/activity.service'
import { ReviewTaskDto, SubmitTaskDto, TaskCommandDto } from './dto/tasks.dto'
import { assertObjectId } from '@/common/personal-scope'

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    @InjectModel(Submission.name) private readonly submissions: Model<SubmissionDocument>,
    @InjectModel(Work.name) private readonly works: Model<WorkDocument>,
    @InjectModel(WorkVersion.name) private readonly versions: Model<WorkVersionDocument>,
    @InjectModel(Workflow.name) private readonly workflows: Model<WorkflowDocument>,
    private readonly domain: TasksService,
    private readonly workflow: WorkflowService,
    private readonly activity: ActivityService,
  ) {}

  data(submission: SubmissionDocument): SubmissionData {
    return {
      id: submission.id,
      taskId: submission.taskId.toString(),
      submitterId: submission.submitterId.toString(),
      workId: submission.workId.toString(),
      workVersionId: submission.workVersionId.toString(),
      round: submission.round,
      comment: submission.comment,
      status: submission.status,
      reviewerId: submission.reviewerId?.toString(),
      reviewedAt: submission.reviewedAt?.toISOString(),
      reviewComment: submission.reviewComment,
      createdAt: submission.createdAt.toISOString(),
    }
  }

  async list(userId: string, id: string, teamId: string): Promise<SubmissionData[]> {
    const task = await this.domain.detail(userId, id, teamId)
    const submissions = await this.submissions
      .find({ taskId: id, enterpriseId: task.enterpriseId, teamId })
      .sort({ round: 1 })
    return submissions.map((submission) => this.data(submission))
  }

  async deliverables(userId: string, id: string, teamId: string): Promise<TaskDeliverable[]> {
    const task = await this.domain.detail(userId, id, teamId)
    if (!task.permissions.execute) throw new ForbiddenException('仅负责人可选择提交成果')
    if (!task.activeWorkflowId || task.status !== 'in_progress') return []
    const workflow = await this.workflows.findOne({
      _id: task.activeWorkflowId,
      taskId: id,
      spaceId: teamId,
      entId: task.enterpriseId,
      status: 'completed',
    })
    if (!workflow) return []
    const versions = await this.versions
      .find({
        sourceWorkflowId: workflow._id,
        sourceRunVersion: workflow.runVersion,
        enterpriseId: task.enterpriseId,
        spaceId: teamId,
        spaceType: 'team',
      })
      .sort({ versionNo: -1 })
    const works = await this.works.find({
      _id: { $in: versions.map((version) => version.workId) },
      spaceId: teamId,
      enterpriseId: task.enterpriseId,
      spaceType: 'team',
    })
    return versions.flatMap((version) => {
      const work = works.find((item) => item._id.equals(version.workId))
      return work
        ? [
            {
              workId: work.id,
              workVersionId: version.id,
              versionNo: version.versionNo,
              title: work.title,
            },
          ]
        : []
    })
  }

  async submit(userId: string, id: string, dto: SubmitTaskDto): Promise<TaskData> {
    assertObjectId(dto.workId)
    assertObjectId(dto.workVersionId)
    return this.tasks.db.transaction(async (session) => {
      const scope = await this.domain.scope(userId, dto.teamId, session)
      const task = await this.domain.load(id, scope, session)
      if (
        !scope.permissions.write ||
        !taskPermissions(scope.role, userId, task.assigneeId?.toString()).execute
      )
        throw new ForbiddenException('仅负责人可提交成果')
      if (task.status !== 'in_progress' || !task.activeWorkflowId)
        throw new ConflictException('请先完成创作或返修')
      const workflow = await this.workflows.findOne(
        {
          _id: task.activeWorkflowId,
          taskId: id,
          spaceId: scope.spaceId,
          entId: scope.enterpriseId,
          status: 'completed',
        },
        null,
        { session },
      )
      if (!workflow) throw new ConflictException('工作流尚未完成')
      const version = await this.versions.findOne(
        {
          _id: dto.workVersionId,
          workId: dto.workId,
          sourceWorkflowId: workflow._id,
          sourceRunVersion: workflow.runVersion,
          enterpriseId: scope.enterpriseId,
          spaceId: scope.spaceId,
          spaceType: 'team',
        },
        null,
        { session },
      )
      const work = await this.works.findOne(
        {
          _id: dto.workId,
          enterpriseId: scope.enterpriseId,
          spaceId: scope.spaceId,
          spaceType: 'team',
        },
        null,
        { session },
      )
      if (!version || !work) throw new NotFoundException('成果版本不属于该任务或空间')
      const previous = await this.submissions
        .findOne({ taskId: id, ...this.domain.filter(scope) }, null, { session })
        .sort({ round: -1 })
      if (previous?.workVersionId.equals(version._id))
        throw new ConflictException('返修必须提交新的成果版本')
      const claimed = await this.tasks.updateOne(
        { _id: id, ...this.domain.filter(scope), status: 'in_progress', version: dto.version },
        { $set: { status: 'submitted' } },
        { session },
      )
      if (!claimed.modifiedCount) throw new ConflictException('任务已变化，请刷新')
      const [submission] = await this.submissions.create(
        [
          {
            ...this.domain.filter(scope),
            taskId: id,
            submitterId: userId,
            workId: dto.workId,
            workVersionId: dto.workVersionId,
            round: (previous?.round ?? 0) + 1,
            comment: dto.comment ?? '',
            status: 'reviewing',
          },
        ],
        { session },
      )
      // 提交后立即进入待审核，submitted 是事务内的中间状态，不开放任意状态写入。
      const updated = await this.tasks.findOneAndUpdate(
        { _id: id, ...this.domain.filter(scope), status: 'submitted', version: dto.version },
        { $set: { status: 'reviewing', latestSubmissionId: submission.id }, $inc: { version: 1 } },
        { session, new: true },
      )
      if (!updated) throw new ConflictException('任务已变化，请刷新')
      await this.activity.record(
        userId,
        scope,
        'task.submitted',
        'task',
        id,
        { status: 'reviewing' },
        session,
        [task.creatorId.toString()],
      )
      return this.domain.data(updated, userId, scope)
    })
  }

  async review(userId: string, id: string, dto: ReviewTaskDto): Promise<TaskData> {
    assertObjectId(dto.submissionId)
    if (dto.decision === 'reject' && !dto.reason?.trim())
      throw new BadRequestException('驳回必须填写原因')
    return this.tasks.db.transaction(async (session) => {
      const scope = await this.domain.scope(userId, dto.teamId, session)
      const task = await this.domain.load(id, scope, session)
      if (!scope.permissions.assignTasks) throw new ForbiddenException('仅 Owner/Admin 可审核')
      if (task.status !== 'reviewing' || task.latestSubmissionId !== dto.submissionId)
        throw new ConflictException('提交已处理或不是最新一轮')
      const approved = dto.decision === 'approve'
      const reviewedAt = new Date()
      const submission = await this.submissions.findOneAndUpdate(
        { _id: dto.submissionId, taskId: id, ...this.domain.filter(scope), status: 'reviewing' },
        {
          $set: {
            status: approved ? 'approved' : 'rejected',
            reviewerId: userId,
            reviewedAt,
            reviewComment: dto.reason?.trim() ?? '',
          },
        },
        { session, new: true },
      )
      if (!submission) throw new ConflictException('提交已被审核')
      const updated = await this.tasks.findOneAndUpdate(
        {
          _id: id,
          ...this.domain.filter(scope),
          status: 'reviewing',
          version: dto.version,
          latestSubmissionId: dto.submissionId,
        },
        {
          $set: {
            status: approved ? 'completed' : 'rejected',
            ...(approved ? { completedAt: reviewedAt } : {}),
          },
          $inc: { version: 1 },
        },
        { session, new: true },
      )
      if (!updated) throw new ConflictException('任务已变化，请刷新')
      await this.activity.record(
        userId,
        scope,
        approved ? 'task.approved' : 'task.rejected',
        'task',
        id,
        { status: updated.status },
        session,
        [task.assigneeId!.toString(), task.creatorId.toString()],
      )
      return this.domain.data(updated, userId, scope)
    })
  }

  async resume(userId: string, id: string, dto: TaskCommandDto): Promise<TaskData> {
    const context = await this.tasks.db.transaction(async (session) => {
      const scope = await this.domain.scope(userId, dto.teamId, session)
      const task = await this.domain.load(id, scope, session)
      if (
        !scope.permissions.write ||
        !taskPermissions(scope.role, userId, task.assigneeId?.toString()).execute
      )
        throw new ForbiddenException('仅负责人可返修')
      if (task.status !== 'rejected' || !task.activeWorkflowId || !task.latestSubmissionId)
        throw new ConflictException('任务不在待返修状态')
      const submission = await this.submissions.findOne(
        {
          _id: task.latestSubmissionId,
          taskId: id,
          ...this.domain.filter(scope),
          status: 'rejected',
        },
        null,
        { session },
      )
      if (!submission?.reviewComment) throw new ConflictException('缺少审核反馈')
      const version = await this.versions.findOne(
        {
          _id: submission.workVersionId,
          sourceWorkflowId: task.activeWorkflowId,
          enterpriseId: scope.enterpriseId,
          spaceId: scope.spaceId,
        },
        null,
        { session },
      )
      const workflow = await this.workflows.findOne(
        {
          _id: task.activeWorkflowId,
          taskId: id,
          spaceId: scope.spaceId,
          entId: scope.enterpriseId,
          status: { $in: ['completed', 'failed'] },
        },
        null,
        { session },
      )
      const result = workflow?.result as WorkflowResult | undefined
      const candidateId = result?.generate?.selectedCandidateId
      if (!version || !workflow || !candidateId)
        throw new ConflictException('原成果执行版本不完整，不能返修')
      if (result?.revision?.id !== version.sourceRevisionId?.toString())
        throw new ConflictException('成果已进入新 Revision，请从工作台继续')
      const updated = await this.tasks.findOneAndUpdate(
        { _id: id, ...this.domain.filter(scope), version: dto.version, status: 'rejected' },
        { $set: { status: 'in_progress' }, $inc: { version: 1 } },
        { session, new: true },
      )
      if (!updated) throw new ConflictException('任务已变化，请刷新')
      await this.activity.record(
        userId,
        scope,
        'task.resumed',
        'task',
        id,
        { status: 'in_progress' },
        session,
      )
      return {
        task: this.domain.data(updated, userId, scope),
        workflowId: task.activeWorkflowId,
        candidateId,
        instruction: submission.reviewComment,
        sourceRevisionId: version.sourceRevisionId?.toString(),
        scope,
      }
    })
    // 模型与队列操作不放进事务；失败保留关联，并由既有 Workflow 错误和重试链路恢复。
    try {
      await this.workflow.optimize(
        context.workflowId,
        {
          sourceCandidateId: context.candidateId,
          categories: [],
          instruction: context.instruction,
        },
        userId,
      )
    } catch (error: unknown) {
      const current = await this.workflows.findOne({
        _id: context.workflowId,
        taskId: id,
        spaceId: dto.teamId,
        entId: context.scope.enterpriseId,
      })
      const result = current?.result as WorkflowResult | undefined
      if (
        current &&
        ['completed', 'failed'].includes(current.status) &&
        result?.revision?.id === context.sourceRevisionId
      ) {
        await this.tasks.db.transaction(async (session) => {
          const restored = await this.tasks.updateOne(
            {
              _id: id,
              ...this.domain.filter(context.scope),
              status: 'in_progress',
              version: context.task.version,
            },
            { $set: { status: 'rejected' }, $inc: { version: 1 } },
            { session },
          )
          if (restored.modifiedCount)
            await this.activity.record(
              userId,
              context.scope,
              'task.resume_failed',
              'task',
              id,
              { status: 'rejected' },
              session,
            )
        })
      }
      throw error
    }
    return context.task
  }
}
