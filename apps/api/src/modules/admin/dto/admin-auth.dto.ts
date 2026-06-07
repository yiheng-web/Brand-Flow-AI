import { IsEmail, IsNotEmpty } from 'class-validator'

export class AdminLoginDto {
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email!: string

  @IsNotEmpty({ message: '密码不能为空' })
  password!: string
}
