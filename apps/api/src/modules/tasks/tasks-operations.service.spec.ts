import { ForbiddenException } from '@nestjs/common'
import { Types } from 'mongoose'
import { TasksOperationsService, taskWeekStart } from './tasks-operations.service'

describe('任务运营', () => {
  it('按上海时区计算周一，包括跨 UTC 日期与周日边界', () => {
    expect(taskWeekStart(new Date('2026-10-11T15:59:59Z')).toISOString()).toBe(
      '2026-10-04T16:00:00.000Z',
    )
    expect(taskWeekStart(new Date('2026-10-11T16:00:00Z')).toISOString()).toBe(
      '2026-10-11T16:00:00.000Z',
    )
  })
  it('成员聚合限制本人和团队，管理统计仅管理员可见', async () => {
    const userId = new Types.ObjectId().toString()
    const teamId = new Types.ObjectId().toString()
    const scope = { permissions: { assignTasks: false } }
    const aggregate = jest.fn().mockResolvedValue([{ mine: [] }])
    const domain = {
      scope: jest.fn().mockResolvedValue(scope),
      filter: jest.fn().mockReturnValue({ teamId }),
    }
    const service = new TasksOperationsService(
      { aggregate } as never,
      {} as never,
      {} as never,
      {} as never,
      domain as never,
      {} as never,
    )
    const result = await service.dashboard(userId, teamId)
    expect(result.mine.todo).toBe(0)
    expect(result.manager).toBeUndefined()
    const pipeline = aggregate.mock.calls[0][0]
    expect(pipeline[0]).toEqual({ $match: { teamId } })
    expect(pipeline[1].$facet.mine[0].$match.assigneeId.toString()).toBe(userId)
    expect(pipeline[1].$facet.manager).toBeUndefined()
    scope.permissions.assignTasks = true
    await service.dashboard(userId, teamId)
    expect(aggregate.mock.calls[1][0][1].$facet.manager).toBeDefined()
    domain.scope.mockRejectedValueOnce(new ForbiddenException())
    await expect(service.dashboard(userId, teamId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(aggregate).toHaveBeenCalledTimes(2)
  })
})
