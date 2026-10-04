import { ApiProperty } from '@nestjs/swagger'

export class HealthLiveResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok'
}

export class HealthReadyResponseDto {
  @ApiProperty({ enum: ['ready'] })
  status!: 'ready'

  @ApiProperty({ example: { mongo: 'ready', redis: 'ready', bullmq: 'ready', storage: 'ready' } })
  checks!: Record<'mongo' | 'redis' | 'bullmq' | 'storage', 'ready' | 'unavailable'>
}
