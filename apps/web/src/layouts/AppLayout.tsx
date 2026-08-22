import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BellOutlined,
  BulbOutlined,
  CheckSquareOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  PictureOutlined,
  QuestionOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { message } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { getMySpaces, switchEnterprise, type SpaceData } from '@/api/org'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore, type SpaceItem } from '@/store/useUserStore'

import styles from './AppLayout.module.css'

interface NavigationItem {
  key: string
  label: string
  path: string
  icon: React.ReactNode
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'home', label: '首页', path: '/home', icon: <HomeOutlined /> },
  { key: 'workspace', label: '工作台', path: '/workspace', icon: <BulbOutlined /> },
  { key: 'knowledge', label: '知识库', path: '/knowledge', icon: <DatabaseOutlined /> },
  { key: 'brand', label: '品牌资产', path: '/brand', icon: <FolderOpenOutlined /> },
  { key: 'tasks', label: '任务空间', path: '/tasks', icon: <CheckSquareOutlined /> },
  { key: 'works', label: '作品空间', path: '/works', icon: <PictureOutlined /> },
  { key: 'notifications', label: '消息通知', path: '/notifications', icon: <BellOutlined /> },
]

const PAGE_TITLES: Record<string, string> = {
  '/workspace': '创作工作台',
  '/knowledge': '知识库',
  '/brand': '品牌资产',
  '/tasks': '任务空间',
  '/works': '作品空间',
  '/notifications': '消息通知',
  '/profile': '个人中心',
  '/organization': '组织详情',
}

function normalizeSpaces(spaces: SpaceData[]): SpaceItem[] {
  const items: SpaceItem[] = [
    {
      id: 'personal',
      name: '个人空间',
      type: 'personal',
      description: '作品和知识归你所有',
    },
  ]

  for (const space of spaces) {
    if (space.type === 'personal') continue
    items.push({
      id: space.spaceId,
      name: space.name,
      type: space.type,
      enterpriseId: space.enterpriseId,
      description:
        space.description ||
        (space.type === 'team' ? '团队品牌知识与协作空间' : '企业统一规则与资产空间'),
    })
  }

  return items
}

const AppLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const setToken = useAuthStore((state) => state.setToken)
  const spaces = useUserStore((state) => state.spaces)
  const currentSpaceId = useUserStore((state) => state.currentSpaceId)
  const currentSpaceName = useUserStore((state) => state.currentSpaceName)
  const setSpaces = useUserStore((state) => state.setSpaces)
  const setCurrentSpace = useUserStore((state) => state.setCurrentSpace)
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false)
  const spaceMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    getMySpaces()
      .then((data) => {
        if (active) setSpaces(normalizeSpaces(data))
      })
      .catch(() => {
        if (active) setSpaces(normalizeSpaces([]))
      })

    return () => {
      active = false
    }
  }, [setSpaces])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!spaceMenuRef.current?.contains(event.target as Node)) setSpaceMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const pageTitle = useMemo(() => {
    const route = Object.keys(PAGE_TITLES).find(
      (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
    )
    return route ? PAGE_TITLES[route] : ''
  }, [location.pathname])

  const handleSwitchSpace = async (space: SpaceItem) => {
    if (space.enterpriseId) {
      try {
        const result = await switchEnterprise(space.enterpriseId)
        setToken(result.access_token)
      } catch {
        message.error('空间切换失败，请稍后重试')
        return
      }
    }

    setCurrentSpace(space.id)
    setSpaceMenuOpen(false)
  }

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar} aria-label="主导航">
        <button type="button" className={styles.brand} onClick={() => navigate('/home')}>
          <span className={styles.brandMark} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>BrandFlow</span>
        </button>

        <div className={styles.spaceSwitcherWrap} ref={spaceMenuRef}>
          <button
            type="button"
            className={styles.spaceSwitcher}
            aria-expanded={spaceMenuOpen}
            aria-haspopup="menu"
            onClick={() => setSpaceMenuOpen((open) => !open)}
          >
            <span className={styles.spaceAvatar}>{currentSpaceName.slice(0, 1)}</span>
            <span className={styles.spaceText}>
              <small>当前空间</small>
              <b>{currentSpaceName}</b>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              ⌄
            </span>
          </button>
          {spaceMenuOpen && (
            <div className={styles.spaceMenu} role="menu">
              <p>切换空间会改变可用知识与规则</p>
              {spaces.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  role="menuitem"
                  className={space.id === currentSpaceId ? styles.spaceMenuActive : ''}
                  onClick={() => void handleSwitchSpace(space)}
                >
                  <span>{space.name.slice(0, 1)}</span>
                  <b>{space.name}</b>
                  {space.id === currentSpaceId && <i>✓</i>}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className={styles.navigation}>
          {NAVIGATION_ITEMS.map((item) => {
            const active = Boolean(
              location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
            )
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                className={active ? styles.navItemActive : ''}
                onClick={() => navigate(item.path)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <button
            type="button"
            className={location.pathname.startsWith('/profile') ? styles.profileActive : ''}
            onClick={() => navigate('/profile')}
          >
            <span className={styles.userAvatar}>{user?.name?.slice(0, 1) || <UserOutlined />}</span>
            <span className={styles.profileText}>
              <b>{user?.name || 'BrandFlow 用户'}</b>
              <small>{user?.email || '个人创作者'}</small>
            </span>
            <i>⋮</i>
          </button>
        </div>
      </aside>

      <section className={styles.mainPanel}>
        <header className={styles.topbar}>
          <h2>{pageTitle}</h2>
          <div className={styles.topActions}>
            <button type="button" aria-label="消息通知" onClick={() => navigate('/notifications')}>
              <BellOutlined />
            </button>
            <button
              type="button"
              aria-label="帮助中心"
              onClick={() => message.info('帮助中心即将开放')}
            >
              <QuestionOutlined />
            </button>
          </div>
        </header>
        <main className={styles.mainContent}>
          <Outlet />
        </main>
      </section>
    </div>
  )
}

export default AppLayout
