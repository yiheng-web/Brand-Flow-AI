import { randomUUID, createHash } from 'node:crypto'
import { Injectable, HttpException, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'
import { User, type UserDocument } from '../org/schemas/user.schema'
import { WORKFLOW_QUEUE } from '../workflow/workflow.constants'

const COUNTER = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current + tonumber(ARGV[1]) > tonumber(ARGV[2]) then
  return math.max(redis.call('TTL', KEYS[1]), 1)
end
redis.call('INCRBY', KEYS[1], ARGV[1])
if current == 0 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
return 0`

@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name)
  readonly runningLimit: number
  readonly leaseMs: number
  readonly imageLimit: number
  readonly retryLimit: number
  readonly authLimit: number
  readonly authWindow: number
  readonly providerMaxAttempts: number

  constructor(
    @InjectQueue(WORKFLOW_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly users?: Model<UserDocument>,
  ) {
    this.runningLimit = this.positive('WORKFLOW_RUNNING_LIMIT', 2)
    this.leaseMs = this.positive('WORKFLOW_RECOVERY_SECONDS', 900) * 1000
    this.imageLimit = this.positive('IMAGE_DAILY_LIMIT', 40)
    this.retryLimit = this.positive('WORKFLOW_RETRY_LIMIT', 20)
    this.authLimit = this.positive('AUTH_RATE_LIMIT', 10)
    this.authWindow = this.positive('AUTH_RATE_WINDOW_SECONDS', 60)
    this.providerMaxAttempts = this.positive('PROVIDER_MAX_ATTEMPTS', 3)
    if (this.providerMaxAttempts > 3) throw new Error('PROVIDER_MAX_ATTEMPTS 不得超过 3')
  }

  private positive(key: string, fallback: number): number {
    const value = Number(this.config.get(key) ?? fallback)
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} 必须为正整数`)
    return value
  }

  private key(suffix: string) {
    return `${this.queue.opts.prefix ?? 'bull'}:v1-limits:${suffix}`
  }

  private async command(operation: (client: Awaited<Queue['client']>) => Promise<unknown>) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.queue.client.then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 3000)
        }),
      ])
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.warn('Redis 额度校验暂不可用，已阻止新的付费调用')
      throw new ServiceUnavailableException('服务暂不可用，请稍后重试')
    } finally {
      clearTimeout(timer)
    }
  }

  private limited(message: string, retryAfter: number): never {
    throw new HttpException({ message, retryAfter }, 429)
  }

  private async consume(
    key: string,
    amount: number,
    limit: number,
    seconds: number,
    message: string,
  ) {
    const wait = Number(
      await this.command((client) =>
        client.eval(COUNTER, 1, this.key(key), amount, limit, seconds),
      ),
    )
    if (wait > 0) this.limited(message, wait)
  }

  async authenticate(address: string, action: string) {
    // 只保存地址摘要；可信代理必须在部署层明确配置，不能直接信任转发头。
    const digest = createHash('sha256').update(address).digest('hex')
    await this.consume(
      `auth:${action}:${digest}`,
      1,
      this.authLimit,
      this.authWindow,
      '登录或注册请求过于频繁，请稍后再试',
    )
  }

  async reserve(userId: string, workflowId: string): Promise<string> {
    if (!this.users) throw new ServiceUnavailableException('运行名额服务不可用')
    const token = `${workflowId}/${Date.now()}/${randomUUID()}`
    // Mongo 原子分配持久化名额；长时间排队不会因 TTL 过期突破并发上限。
    const user = await this.users
      .findOneAndUpdate(
        {
          _id: userId,
          status: 'active',
          $expr: {
            $lt: [{ $size: { $ifNull: ['$runningWorkflowLeases', []] } }, this.runningLimit],
          },
        },
        { $addToSet: { runningWorkflowLeases: token } },
        { new: true },
      )
      .select('_id')
    if (!user) this.limited('同时执行的任务已达上限，请等待任务完成或取消后再试', 5)
    return token
  }

  async renew(userId: string, token: string) {
    if (!this.users) throw new ServiceUnavailableException('运行名额服务不可用')
    if (!(await this.users.exists({ _id: userId, runningWorkflowLeases: token })))
      throw new ServiceUnavailableException('运行名额已改变，请刷新后重试')
  }

  async release(userId: string, token?: string) {
    if (!token) return
    try {
      if (!this.users) throw new Error('运行名额服务不可用')
      await this.users.updateOne({ _id: userId }, { $pull: { runningWorkflowLeases: token } })
    } catch {
      // 主状态已经持久化；补偿失败不会覆盖结果，对账会移除无归属的名额。
      this.logger.warn('运行名额清理失败，将由任务对账回收')
    }
  }

  async images(userId: string, count: number) {
    const now = Date.now()
    const day = new Date(now).toISOString().slice(0, 10)
    const seconds = Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86400000 - now) / 1000)
    await this.consume(
      `images:${userId}:${day}`,
      count,
      this.imageLimit,
      seconds,
      '今日生图额度已用完，请在 UTC 次日重试',
    )
  }

  async retry(workflowId: string) {
    await this.consume(
      `retries:${workflowId}`,
      1,
      this.retryLimit,
      30 * 86400,
      '此任务的重试额度已用完，请稍后重试或创建新任务',
    )
  }
}
