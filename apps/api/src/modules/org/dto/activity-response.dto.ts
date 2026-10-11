import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class NotificationResponseDto {
  @ApiProperty() _id!: string
  @ApiProperty() recipientId!: string
  @ApiProperty() enterpriseId!: string
  @ApiPropertyOptional() teamId?: string
  @ApiProperty() action!: string
  @ApiProperty() resourceId!: string
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiPropertyOptional({ format: 'date-time' }) readAt?: string
}

export class AuditLogResponseDto {
  @ApiProperty() _id!: string
  @ApiPropertyOptional({ description: '自动事件无用户 actor' }) actorId?: string
  @ApiProperty() enterpriseId!: string
  @ApiPropertyOptional() teamId?: string
  @ApiProperty() action!: string
  @ApiProperty() resourceType!: string
  @ApiProperty() resourceId!: string
  @ApiProperty({
    type: Object,
    description: 'role、status、isRequired；任务拒绝派发事件另含 reason',
  })
  metadata!: Record<string, string | boolean>
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class UnreadCountResponseDto {
  @ApiProperty() count!: number
}

export class MarkNotificationReadResponseDto {
  @ApiProperty() success!: boolean
}
