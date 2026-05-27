import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator'
import { WORKFLOW_NODE_IDS, type WorkflowNodeId } from '../workflow.constants'

export class CreateWorkflowDto {
  @IsString({ message: '创意描述必须是字符串' })
  @IsNotEmpty({ message: '创意描述不能为空' })
  prompt!: string

  @IsString({ message: '空间 ID 必须是字符串' })
  @IsNotEmpty({ message: '空间 ID 不能为空' })
  spaceId!: string
}

export class RerunWorkflowDto {
  @IsString({ message: '回溯节点 ID 必须是字符串' })
  @IsIn(WORKFLOW_NODE_IDS, { message: '回溯节点 ID 不合法' })
  rerunFromNodeId!: WorkflowNodeId

  @IsObject({ message: 'Session Context 必须是对象' })
  sessionContext!: Record<string, unknown>
}
