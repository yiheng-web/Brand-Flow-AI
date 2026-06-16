import { IsNotEmpty, IsString, IsOptional, IsArray, IsIn } from 'class-validator'

export class CreateWorkflowDto {
  @IsString({ message: '创意描述必须是字符串' })
  @IsNotEmpty({ message: '创意描述不能为空' })
  prompt!: string

  @IsString({ message: '空间 ID 必须是字符串' })
  @IsNotEmpty({ message: '空间 ID 不能为空' })
  spaceId!: string

  @IsString({ message: '空间类型必须是 personal, team, 或 enterprise' })
  @IsIn(['personal', 'team', 'enterprise'])
  spaceType!: 'personal' | 'team' | 'enterprise'

  @IsOptional()
  @IsArray({ message: '知识库 ID 列表必须是数组' })
  @IsString({ each: true, message: '知识库 ID 必须是字符串' })
  selectedKnowledgeBaseIds?: string[]
}
