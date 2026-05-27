import { IsIn, IsString } from 'class-validator'

import type { KnowledgeScope } from '@brand-flow/common'

export class KnowledgeQueryDto {
  @IsIn(['personal', 'team'])
  scope!: KnowledgeScope
}

export class CreateKnowledgeBaseDto {
  @IsIn(['personal', 'team'])
  scope!: KnowledgeScope

  @IsString()
  name!: string
}
