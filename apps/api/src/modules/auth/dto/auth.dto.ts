import { IsEmail, IsNotEmpty, MinLength, IsOptional, MaxLength } from 'class-validator'

export class RegisterDto {
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email!: string

  @MinLength(6, { message: '密码长度不能少于 6 位' })
  @IsNotEmpty({ message: '密码不能为空' })
  password!: string

  @IsOptional()
  @MaxLength(20, { message: '昵称长度不能超过 20 位' })
  nickname?: string
}

export class LoginDto {
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email!: string

  @IsNotEmpty({ message: '密码不能为空' })
  password!: string
}
