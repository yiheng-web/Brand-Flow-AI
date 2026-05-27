import { Injectable } from '@nestjs/common'

import type { InviteCodeDto, TeamDto } from '@brand-flow/common'

const demoUser = {
  id: 'demo-user',
  name: '王同学',
  email: 'wang@hdu.edu.cn',
}

@Injectable()
export class TeamService {
  private team: TeamDto = {
    id: 'personal',
    name: '',
    hasTeam: false,
    role: 'personal',
    members: [],
  }

  private inviteCode: InviteCodeDto | null = null

  getCurrentTeam(): TeamDto {
    return this.team
  }

  createTeam(name: string): TeamDto {
    this.team = {
      id: 'team-demo',
      name,
      hasTeam: true,
      role: 'admin',
      members: [{ ...demoUser, role: 'admin', isSelf: true }],
    }
    return this.team
  }

  generateInviteCode(): InviteCodeDto {
    this.inviteCode = {
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
    return this.inviteCode
  }

  joinTeam(code: string): TeamDto {
    const normalizedCode = code.toUpperCase()
    const validCode = this.inviteCode?.code ?? 'XY8A9Z'

    if (normalizedCode !== validCode) {
      this.inviteCode = {
        code: normalizedCode,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }
    }

    this.team = {
      id: 'team-demo',
      name: this.team.name || '瑞幸项目大组',
      hasTeam: true,
      role: 'member',
      members: [{ ...demoUser, role: 'member', isSelf: true }],
    }
    return this.team
  }
}
