import { Body, Controller, Get, Post } from '@nestjs/common'

import type { InviteCodeDto, TeamDto } from '@brand-flow/common'

import { CreateTeamDto, JoinTeamDto } from './dto/team.dto'
import { TeamService } from './team.service'

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('current')
  getCurrentTeam(): TeamDto {
    return this.teamService.getCurrentTeam()
  }

  @Post('create')
  createTeam(@Body() dto: CreateTeamDto): TeamDto {
    return this.teamService.createTeam(dto.name)
  }

  @Post('invite-code')
  generateInviteCode(): InviteCodeDto {
    return this.teamService.generateInviteCode()
  }

  @Post('join')
  joinTeam(@Body() dto: JoinTeamDto): TeamDto {
    return this.teamService.joinTeam(dto.code)
  }
}
