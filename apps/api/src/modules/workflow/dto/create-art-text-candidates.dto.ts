import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class CreateArtTextCandidatesDto {
  @ApiProperty({ description: '用户选中的底图候选 ID' })
  @IsString()
  @IsNotEmpty()
  baseCandidateId!: string

  @ApiProperty({
    description: '需要渲染为艺术字的文本内容',
    example: '夏日第一杯清爽咖啡',
  })
  @IsString({ message: '文本内容必须是字符串' })
  @IsNotEmpty({ message: '文本内容不能为空' })
  @MaxLength(120, { message: '文本内容不能超过 120 个字符' })
  textContent!: string

  @ApiProperty({
    description: '艺术字生成的视觉风格要求',
    example: '蓝白配色，清爽夏日感，字体圆润醒目，带一点冰感高光，不遮挡咖啡主体',
  })
  @IsString({ message: '风格要求必须是字符串' })
  @IsNotEmpty({ message: '风格提示词不能为空' })
  @MaxLength(300, { message: '风格提示词不能超过 300 个字符' })
  stylePrompt!: string
}
