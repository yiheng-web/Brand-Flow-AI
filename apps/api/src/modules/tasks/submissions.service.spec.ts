import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { Role, spacePermissions } from '@brand-flow/contracts'
import { SubmissionsService } from './submissions.service'
import { SubmissionSchema } from './schemas/submission.schema'

describe('提交审核权限、不可变历史与竞争', () => {
  const actor = new Types.ObjectId().toString()
  const taskId = new Types.ObjectId().toString()
  const teamId = new Types.ObjectId().toString()
  const enterpriseId = new Types.ObjectId().toString()
  const submissionId = new Types.ObjectId().toString()
  const workId = new Types.ObjectId().toString()
  const versionId = new Types.ObjectId().toString()
  const workflowId = new Types.ObjectId().toString()
  const task = {
    status: 'reviewing',
    latestSubmissionId: submissionId,
    version: 3,
    creatorId: new Types.ObjectId(actor),
    assigneeId: new Types.ObjectId(actor),
    activeWorkflowId: workflowId,
  }
  const tasks = { db: { transaction: jest.fn(async (fn) => fn({})) }, findOneAndUpdate: jest.fn() }
  const submissions = { findOneAndUpdate: jest.fn() }
  const versions = { findOne: jest.fn() }
  const workflows = { findOne: jest.fn() }
  const works = { findOne: jest.fn() }
  const scope = {
    role: Role.ADMIN,
    spaceId: teamId,
    enterpriseId,
    permissions: spacePermissions('team', Role.ADMIN),
  }
  const domain = {
    scope: jest.fn(),
    load: jest.fn(),
    filter: () => ({ teamId, enterpriseId }),
    data: jest.fn((value) => value),
  }
  const activity = { record: jest.fn() }
  const service = new SubmissionsService(
    tasks as never,
    submissions as never,
    works as never,
    versions as never,
    workflows as never,
    domain as never,
    {} as never,
    activity as never,
  )
  beforeEach(() => {
    jest.clearAllMocks()
    domain.scope.mockResolvedValue(scope)
    domain.load.mockResolvedValue(task)
    tasks.findOneAndUpdate.mockResolvedValue({ ...task, status: 'completed' })
    submissions.findOneAndUpdate.mockResolvedValue({})
  })
  it('Member 无法伪造审核人', async () => {
    domain.scope.mockResolvedValue({ ...scope, permissions: spacePermissions('team', Role.MEMBER) })
    await expect(
      service.review(actor, taskId, { teamId, version: 3, submissionId, decision: 'approve' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(submissions.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('空驳回原因拒绝且不写入历史', async () => {
    await expect(
      service.review(actor, taskId, {
        teamId,
        version: 3,
        submissionId,
        decision: 'reject',
        reason: ' ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(submissions.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('不能重新审核历史轮次', async () => {
    await expect(
      service.review(actor, taskId, {
        teamId,
        version: 3,
        submissionId: new Types.ObjectId().toString(),
        decision: 'approve',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })
  it('approve/reject 同时争用相同审核状态，仅一个写入成功', async () => {
    let claimed = false
    submissions.findOneAndUpdate.mockImplementation(async (filter) => {
      expect(filter).toEqual({
        _id: submissionId,
        taskId,
        enterpriseId,
        teamId,
        status: 'reviewing',
      })
      if (claimed) return null
      claimed = true
      return {}
    })
    const results = await Promise.allSettled([
      service.review(actor, taskId, { teamId, version: 3, submissionId, decision: 'approve' }),
      service.review(actor, taskId, {
        teamId,
        version: 3,
        submissionId,
        decision: 'reject',
        reason: '不符合要求',
      }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(activity.record).toHaveBeenCalledTimes(1)
  })
  it('不可提交其他任务或空间版本，查询绑定 Workflow、runVersion 和租户', async () => {
    domain.load.mockResolvedValue({ ...task, status: 'in_progress' })
    workflows.findOne.mockResolvedValue({ _id: new Types.ObjectId(workflowId), runVersion: 7 })
    versions.findOne.mockResolvedValue(null)
    works.findOne.mockResolvedValue({})
    await expect(
      service.submit(actor, taskId, { teamId, version: 3, workId, workVersionId: versionId }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(versions.findOne.mock.calls[0][0]).toMatchObject({
      sourceWorkflowId: new Types.ObjectId(workflowId),
      sourceRunVersion: 7,
      enterpriseId,
      spaceId: teamId,
      spaceType: 'team',
    })
  })
  it('提交主体和成果引用不可覆盖，round 在同一 Task 下唯一', () => {
    for (const key of [
      'taskId',
      'enterpriseId',
      'teamId',
      'submitterId',
      'workId',
      'workVersionId',
      'round',
      'comment',
    ])
      expect(SubmissionSchema.path(key).options.immutable).toBe(true)
    expect(SubmissionSchema.indexes()).toContainEqual([
      { taskId: 1, round: 1 },
      expect.objectContaining({ unique: true }),
    ])
  })
})
