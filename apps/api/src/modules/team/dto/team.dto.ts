import { IsString, Length } from 'class-validator'

export class CreateTeamDto {
  @IsString()
  name!: string
}

export class JoinTeamDto {
  @IsString()
  @Length(6, 6)
  code!: string
}
