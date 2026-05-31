import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  HomeOutlined,
  ToolOutlined,
  FolderOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import styles from './AppLayout.module.css'

type NavKey = 'home' | 'workspace' | 'brand' | 'profile'

const iconMap: Record<NavKey, React.ReactNode> = {
  home: <HomeOutlined />,
  workspace: <ToolOutlined />,
  brand: <FolderOutlined />,
  profile: <UserOutlined />,
}

const navItems: Array<{ key: NavKey; label: string; path: string }> = [
  { key: 'home', label: '首页', path: '/home' },
  { key: 'workspace', label: '工作台', path: '/workspace' },
  { key: 'brand', label: '品牌档案', path: '/brand' },
]

const AppLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  const initialKey: NavKey = location.pathname.includes('workspace')
    ? 'workspace'
    : location.pathname.includes('brand')
      ? 'brand'
      : location.pathname.includes('profile')
        ? 'profile'
        : 'home'
  const [activeKey, setActiveKey] = useState<NavKey>(initialKey)

  const handleNavClick = (item: (typeof navItems)[number]) => {
    setActiveKey(item.key)
    navigate(item.path)
  }

  const handleProfileClick = () => {
    setActiveKey('profile')
    navigate('/profile')
  }

  const toggleCollapse = () => {
    setSidebarCollapsed((prev) => !prev)
  }

  const renderNavItem = (
    item: (typeof navItems)[number] | { key: 'profile'; label: string; onClick: () => void },
    isActive: boolean
  ) => (
    <button
      key={item.key}
      type="button"
      onClick={'onClick' in item ? item.onClick : () => handleNavClick(item as (typeof navItems)[number])}
      title={item.label}
      className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
    >
      <span className={styles.navIcon}>{iconMap[item.key as NavKey]}</span>
      {!sidebarCollapsed && <span className={styles.navLabel}>{item.label}</span>}
    </button>
  )

  return (
    <div className={styles.window}>
      <aside
        className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded}`}
      >
        <div className={styles.navTop}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleCollapse}
            title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            <span className={styles.navIcon}>
              {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            {!sidebarCollapsed && <span className={styles.navLabel}>收起</span>}
          </button>

          {navItems.map((item) =>
            renderNavItem(item, item.key === activeKey)
          )}
        </div>

        <div className={styles.navBottom}>
          {renderNavItem(
            { key: 'profile', label: '个人中心', onClick: handleProfileClick },
            activeKey === 'profile'
          )}
        </div>
      </aside>

      <main className={styles.mainContent}>
        <Outlet context={{ activeKey }} />
      </main>
    </div>
  )
}

export default AppLayout