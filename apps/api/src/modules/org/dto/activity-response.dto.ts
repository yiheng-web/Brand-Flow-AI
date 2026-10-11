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
  @ApiProperty() actorId!: string
  @ApiProperty() enterpriseId!: string
  @ApiPropertyOptional() teamId?: string
  @ApiProperty() action!: string
  @ApiProperty() resourceType!: string
  @ApiProperty() resourceId!: string
  @ApiProperty({ type: Object, description: '仅 role、status、isRequired 状态字段' })
  metadata!: Record<string, string | boolean>
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class UnreadCountResponseDto {
  @ApiProperty() count!: number
}

export class MarkNotificationReadResponseDto {
  @ApiProperty() success!: boolean
}
