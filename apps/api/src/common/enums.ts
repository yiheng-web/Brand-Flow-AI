/**
 * 用户角色
 */
export { Role } from '@brand-flow/contracts'

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
}
