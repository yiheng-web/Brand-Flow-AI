import type { InviteCodeDto, JoinTeamRequest, TeamDto } from '@brand-flow/common'

import { apiClient } from './client'

export function getTeam() {
  return apiClient.get<TeamDto>('/team/current')
}

export function createTeam(name: string) {
  return apiClient.post<TeamDto>('/team/create', { name })
}

export function generateInviteCode() {
  return apiClient.post<InviteCodeDto>('/team/invite-code')
}

export function joinTeam(params: JoinTeamRequest) {
  return apiClient.post<TeamDto>('/team/join', params)
}
