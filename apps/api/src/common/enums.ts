/**
 * 用户角色
 */
export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/**
 * 资产或组织归属类型
 */
export enum OwnerType {
  USER = 'user',
  TEAM = 'team',
  WORKSPACE = 'workspace',
}

/**
 * 资产可见性
 */
export enum Visibility {
  PRIVATE = 'private',
  TEAM = 'team',
  WORKSPACE = 'workspace',
  PUBLIC = 'public',
}
