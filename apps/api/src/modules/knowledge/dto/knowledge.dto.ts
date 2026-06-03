import { IsArray, IsObject, IsString, IsOptional, IsNotEmpty } from 'class-validator'

export class CreateKnowledgeDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  pineconeNamespace?: string
}

export class UpdateKnowledgeDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  pineconeNamespace?: string
}

export class IngestKnowledgeDto {
  @IsString()
  @IsNotEmpty({ message: '文本内容不能为空' })
  content!: string
}

export class CreateKnowledgeItemDto {
  @IsString()
  @IsNotEmpty({ message: '知识项标题不能为空' })
  title!: string

  @IsString()
  @IsNotEmpty({ message: '知识项内容不能为空' })
  content!: string

  @IsArray()
  @IsOptional()
  tags?: string[]

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>
}

export class UpdateKnowledgeItemDto {
  @IsString()
  @IsOptional()
  title?: string

  @IsString()
  @IsOptional()
  content?: string

  @IsArray()
  @IsOptional()
  tags?: string[]

  @IsString()
  @IsOptional()
  status?: 'active' | 'archived'

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>
}
