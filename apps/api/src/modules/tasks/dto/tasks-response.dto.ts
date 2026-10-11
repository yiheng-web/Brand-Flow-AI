import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TASK_PRIORITIES, TASK_STATUSES, SUBMISSION_STATUSES } from '@brand-flow/contracts'
import type {
  TaskData,
  TaskPage,
  TaskStatus,
  TaskPriority,
  TaskRequirement,
  TaskPermission,
  SubmissionData,
  SubmissionStatus,
  TaskDeliverable,
  TaskDashboardData,
  TaskMetrics,
} from '@brand-flow/contracts'

export class TaskResponseDto implements TaskData {
  @ApiProperty() id!: string
  @ApiProperty() enterpriseId!: string
  @ApiProperty() teamId!: string
  @ApiProperty() creatorId!: string
  @ApiPropertyOptional() assigneeId?: string
  @ApiProperty() title!: string
  @ApiProperty() description!: string
  @ApiProperty({ enum: TASK_PRIORITIES }) priority!: TaskPriority
  @ApiPropertyOptional({ format: 'date-time' }) deadline?: string
  @ApiProperty({ enum: TASK_STATUSES }) status!: TaskStatus
  @ApiProperty() version!: number
  @ApiProperty({ type: Object }) requirementSnapshot!: TaskRequirement
  @ApiPropertyOptional() activeWorkflowId?: string
  @ApiPropertyOptional() latestSubmissionId?: string
  @ApiPropertyOptional() declineReason?: string
  @ApiProperty({ type: Object }) permissions!: TaskPermission
  @ApiProperty() overdue!: boolean
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
  @ApiPropertyOptional({ type: Object }) progress?: TaskData['progress']
}
export class TaskPageResponseDto implements TaskPage {
  @ApiProperty({ type: [TaskResponseDto] }) items!: TaskData[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
}
export class SubmissionResponseDto implements SubmissionData {
  @ApiProperty() id!: string
  @ApiProperty() taskId!: string
  @ApiProperty() submitterId!: string
  @ApiProperty() workId!: string
  @ApiProperty() workVersionId!: string
  @ApiProperty() round!: number
  @ApiProperty() comment!: string
  @ApiProperty({ enum: SUBMISSION_STATUSES }) status!: SubmissionStatus
  @ApiPropertyOptional() reviewerId?: string
  @ApiPropertyOptional({ format: 'date-time' }) reviewedAt?: string
  @ApiPropertyOptional() reviewComment?: string
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}
export class TaskDeliverableResponseDto implements TaskDeliverable {
  @ApiProperty() workId!: string
  @ApiProperty() workVersionId!: string
  @ApiProperty() versionNo!: number
  @ApiProperty() title!: string
}
export class TaskDashboardResponseDto implements TaskDashboardData {
  @ApiProperty({ type: Object }) mine!: TaskMetrics
  @ApiPropertyOptional({ type: Object }) manager?: TaskMetrics
}
