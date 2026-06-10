import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateArtTextCandidatesDto {
  @ApiProperty({
    description: '需要渲染为艺术字的文本内容',
    example: '夏日第一杯清爽咖啡',
  })
  @IsString({ message: '文本内容必须是字符串' })
  @IsNotEmpty({ message: '文本内容不能为空' })
  textContent!: string

  @ApiPropertyOptional({
    description: '艺术字生成的视觉风格要求',
    example: '蓝白配色，清爽夏日感，字体圆润醒目，带一点冰感高光，不遮挡咖啡主体',
  })
  @IsOptional()
  @IsString({ message: '风格要求必须是字符串' })
  stylePrompt?: string

  @ApiPropertyOptional({
    description: '需要避免的负向提示词或约束',
    example: '不要遮挡主体，不要使用暗色背景',
  })
  @IsOptional()
  @IsString({ message: '负向提示词必须是字符串' })
  negativePrompt?: string
}
