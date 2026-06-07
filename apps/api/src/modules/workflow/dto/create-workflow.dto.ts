import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateWorkflowDto {
  @IsString({ message: '创意描述必须是字符串' })
  @IsNotEmpty({ message: '创意描述不能为空' })
  prompt!: string

  @IsString({ message: '空间 ID 必须是字符串' })
  @IsNotEmpty({ message: '空间 ID 不能为空' })
  spaceId!: string

  @IsOptional()
  @IsString({ message: '知识库 ID 必须是字符串' })
  knowledgeId?: string

  @IsOptional()
  @IsArray({ message: '选择的知识库必须是数组' })
  @IsString({ each: true, message: '知识库 ID 必须是字符串' })
  selectedKnowledgeBaseIds?: string[]
}
