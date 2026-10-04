import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { InjectQueue } from '@nestjs/bullmq'
import type { Connection } from 'mongoose'
import type { Queue } from 'bullmq'
import { ApiOperation, ApiTags, ApiServiceUnavailableResponse } from '@nestjs/swagger'
import { ApiSuccessResponse } from '../../common/swagger/api-success-response'
import { StorageService } from '../storage/storage.service'
import { WORKFLOW_QUEUE } from '../workflow/workflow.constants'
import { HealthLiveResponseDto, HealthReadyResponseDto } from './health.dto'

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @InjectQueue(WORKFLOW_QUEUE) private readonly queue: Queue,
    private readonly storage: StorageService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: '进程存活检查' })
  @ApiSuccessResponse(HealthLiveResponseDto)
  live(): HealthLiveResponseDto {
    return { status: 'ok' }
  }

  @Get('ready')
  @ApiOperation({ summary: 'Mongo/Redis/BullMQ/对象存储就绪检查' })
  @ApiSuccessResponse(HealthReadyResponseDto)
  @ApiServiceUnavailableResponse({ description: '必要依赖未就绪，data.checks 包含各依赖状态' })
  async ready(): Promise<HealthReadyResponseDto> {
    const operations = {
      mongo: async () => {
        if (this.mongo.readyState !== 1 || !this.mongo.db) throw new Error('not connected')
        await this.mongo.db.command({ ping: 1 }, { timeoutMS: 2500 })
      },
      redis: async () => {
        await (await this.queue.client).ping()
      },
      bullmq: async () => {
        await this.queue.getJobCounts('waiting', 'active')
      },
      storage: async () => {
        await this.storage.checkReady()
      },
    }
    const checks: HealthReadyResponseDto['checks'] = {
      mongo: 'unavailable',
      redis: 'unavailable',
      bullmq: 'unavailable',
      storage: 'unavailable',
    }
    await Promise.all(
      (['mongo', 'redis', 'bullmq', 'storage'] as const).map(async (name) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            operations[name](),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('timeout')), 3000)
            }),
          ])
          checks[name] = 'ready'
        } catch {
          checks[name] = 'unavailable'
        } finally {
          clearTimeout(timer)
        }
      }),
    )
    if (Object.values(checks).some((state) => state !== 'ready'))
      throw new ServiceUnavailableException({ message: '依赖未就绪', checks })
    return { status: 'ready', checks }
  }
}
