import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  AppstoreAddOutlined,
  FolderOpenOutlined,
  MenuOutlined,
  NodeIndexOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons'

import { useAppStore } from '@/store/useAppStore'
import { useUserStore } from '@/store/useUserStore'

import styles from './NavRail.module.css'

interface NavItem {
  label: string
  path: string
  icon: ReactNode
}

const primaryNavItems: NavItem[] = [
  { label: '新建创作', path: '/home', icon: <AppstoreAddOutlined /> },
  { label: '工作台', path: '/workspace', icon: <NodeIndexOutlined /> },
  { label: '品牌档案', path: '/knowledge', icon: <FolderOpenOutlined /> },
]

const bottomNavItems: NavItem[] = [
  { label: '系统设置', path: '/settings', icon: <SettingOutlined /> },
]

export function NavRail() {
  const expanded = useAppStore((state) => state.navExpanded)
  const setExpanded = useAppStore((state) => state.setNavExpanded)
  const userName = useUserStore((state) => state.name)
  const role = useUserStore((state) => state.role)
  const avatarText = userName.charAt(0).toUpperCase()
  const roleText = role === 'admin' ? '团队管理员' : role === 'member' ? '团队成员' : '个人用户'

  const renderNavLink = (item: NavItem) => (
    <NavLink
      key={item.path}
      className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
      title={item.label}
      to={item.path}
    >
      <span className={styles.icon}>{item.icon}</span>
      <span className={styles.label}>{item.label}</span>
    </NavLink>
  )

  return (
    <aside className={`${styles.navRail} ${expanded ? styles.expanded : ''}`}>
      <button
        className={styles.navItem}
        title={expanded ? '收起菜单' : '展开菜单'}
        type="button"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.icon}>
          <MenuOutlined />
        </span>
        <span className={styles.label}>{expanded ? '收起菜单' : '展开菜单'}</span>
      </button>

      <div className={styles.navGroup}>{primaryNavItems.map(renderNavLink)}</div>

      <div className={styles.navBottom}>
        {bottomNavItems.map(renderNavLink)}
        <NavLink
          className={({ isActive }) => `${styles.avatarButton} ${isActive ? styles.active : ''}`}
          title="个人中心"
          to="/profile"
        >
          <span className={styles.avatar}>{avatarText || <UserOutlined />}</span>
          <span className={`${styles.label} ${styles.avatarText}`}>
            <span>{userName}</span>
            <span className={styles.avatarRole}>{roleText}</span>
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
