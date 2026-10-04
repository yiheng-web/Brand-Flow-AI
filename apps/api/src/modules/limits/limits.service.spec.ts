import { ConfigService } from '@nestjs/config'
import { LimitsService } from './limits.service'

describe('V1 额度服务的配置与故障边界', () => {
  const queue = (client: unknown) => ({
    client: Promise.resolve(client),
    opts: { prefix: 'isolated' },
  })

  it.each([0, -1, 1.5, 'invalid'])('拒绝无效上限 %s，不能静默关闭保护', (limit) => {
    expect(
      () => new LimitsService(queue({}) as never, new ConfigService({ IMAGE_DAILY_LIMIT: limit })),
    ).toThrow('IMAGE_DAILY_LIMIT 必须为正整数')
  })

  it('Redis 故障阻止授权新的生图，返回可理解的 503', async () => {
    const evalCommand = jest.fn().mockRejectedValue(new Error('private-redis-address'))
    const limits = new LimitsService(queue({ eval: evalCommand }) as never, new ConfigService())
    await expect(limits.images('user-a', 4)).rejects.toMatchObject({
      status: 503,
      message: '服务暂不可用，请稍后重试',
    })
  })

  it('名额清理只删除自己的执行令牌，清理故障不会覆盖已持久化结果', async () => {
    const updateOne = jest.fn().mockRejectedValue(new Error('offline'))
    const limits = new LimitsService(queue({}) as never, new ConfigService(), {
      updateOne,
    } as never)
    await expect(limits.release('user-a', 'workflow/own-token')).resolves.toBeUndefined()
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'user-a' },
      { $pull: { runningWorkflowLeases: 'workflow/own-token' } },
    )
  })
})
