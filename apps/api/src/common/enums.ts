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
 * 平台后台管理员角色
 */
export enum PlatformRole {
  SUPER_ADMIN = 'super_admin',
  OPS_ADMIN = 'ops_admin',
  SUPPORT = 'support',
  AUDITOR = 'auditor',
}

/**
 * 企业级角色
 */
export enum EnterpriseRole {
  ENTERPRISE_ADMIN = 'enterprise_admin',
  BRAND_MANAGER = 'brand_manager',
  MEMBER = 'member',
}

/**
 * 团队级角色
 */
export enum TeamRole {
  TEAM_ADMIN = 'team_admin',
  KNOWLEDGE_MANAGER = 'knowledge_manager',
  CREATOR = 'creator',
  VIEWER = 'viewer',
}

/**
 * 资产或组织归属类型
 */
export enum OwnerType {
  USER = 'user',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
}

/**
 * 资产可见性
 */
export enum Visibility {
  PRIVATE = 'private',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
  PUBLIC = 'public',
}
