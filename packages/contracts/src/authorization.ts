export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export type RoleValue = `${Role}`

export type SpaceRef =
  | { type: 'personal'; ownerId: string }
  | { type: 'enterprise'; enterpriseId: string }
  | { type: 'team'; enterpriseId: string; teamId: string }

export interface EnterpriseMembership {
  enterpriseId: string
  role: Role
}

export interface TeamMembership extends EnterpriseMembership {
  teamId: string
}

export interface SpacePermissions {
  read: boolean
  write: boolean
  manageMembers: boolean
  manageKnowledge: boolean
  manageAssets: boolean
  manageWorks: boolean
  assignTasks: boolean
}

export function spacePermissions(
  type: 'personal' | 'team' | 'enterprise',
  role: Role,
): SpacePermissions {
  const manager = role === Role.OWNER || role === Role.ADMIN
  const write = role !== Role.VIEWER
  return {
    read: true,
    write,
    manageMembers: type !== 'personal' && manager,
    manageKnowledge: manager,
    manageAssets: manager,
    manageWorks: write,
    assignTasks: type !== 'personal' && manager,
  }
}
