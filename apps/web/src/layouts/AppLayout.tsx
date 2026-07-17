import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ApartmentOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'

import styles from './AppLayout.module.css'

interface NavigationItem {
  key: string
  label: string
  path: string
  icon: React.ReactNode
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'home', label: '首页', path: '/home', icon: <HomeOutlined /> },
  { key: 'workspace', label: '工作台', path: '/workspace', icon: <ApartmentOutlined /> },
  { key: 'knowledge', label: '知识库', path: '/knowledge', icon: <DatabaseOutlined /> },
  { key: 'brand', label: '品牌资产', path: '/brand', icon: <FolderOpenOutlined /> },
  { key: 'works', label: '作品中心', path: '/works', icon: <PictureOutlined /> },
]

const AppLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)')
    const handleViewportChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setSidebarCollapsed(event.matches)
    }

    handleViewportChange(media)
    media.addEventListener('change', handleViewportChange)
    return () => media.removeEventListener('change', handleViewportChange)
  }, [])

  const renderNavigationItem = (item: NavigationItem) => {
    const isActive =
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    const button = (
      <button
        key={item.key}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        aria-label={sidebarCollapsed ? item.label : undefined}
        className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        onClick={() => navigate(item.path)}
      >
        <span className={styles.navIcon} aria-hidden="true">
          {item.icon}
        </span>
        {!sidebarCollapsed && <span className={styles.navLabel}>{item.label}</span>}
      </button>
    )

    return sidebarCollapsed ? (
      <Tooltip key={item.key} title={item.label} placement="right">
        {button}
      </Tooltip>
    ) : (
      button
    )
  }

  return (
    <div className={styles.appShell}>
      <aside
        className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}
        aria-label="主导航"
      >
        <div className={styles.brandRow}>
          <button
            type="button"
            className={styles.brandButton}
            aria-label="返回首页"
            onClick={() => navigate('/home')}
          >
            <span className={styles.brandMark}>BF</span>
            {!sidebarCollapsed && <span className={styles.brandName}>Brand-Flow AI</span>}
          </button>
        </div>

        <nav className={styles.navigation}>{NAVIGATION_ITEMS.map(renderNavigationItem)}</nav>

        <div className={styles.sidebarFooter}>
          {renderNavigationItem({
            key: 'profile',
            label: '个人中心',
            path: '/profile',
            icon: <UserOutlined />,
          })}
          <Tooltip title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'} placement="right">
            <button
              type="button"
              className={styles.collapseButton}
              aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              </span>
              {!sidebarCollapsed && <span>收起侧栏</span>}
            </button>
          </Tooltip>
        </div>
      </aside>

      <main className={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
