import type { RoleValue } from './authorization'

export type EnterpriseStatus = 'active' | 'disabled'
export type TeamStatus = 'active' | 'archived'
export const INVITATION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
] as const
export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export interface InvitationData {
  id: string
  spaceId: string
  spaceName: string
  enterpriseId: string
  teamId?: string
  inviterId: string
  inviteeEmail: string
  targetRole: RoleValue
  status: InvitationStatus
  expiresAt: string
  canRespond: boolean
  canCancel: boolean
}

export interface CreateInvitationResult {
  invitation: InvitationData
  inviteCode: string
}
