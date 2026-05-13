import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import styles from './AppLayout.module.css'

type NavKey = 'home' | 'workspace' | 'profile'

const navItems: Array<{ key: Extract<NavKey, 'home' | 'workspace'>; label: string; text: string; path: string }> = [
  { key: 'home', label: '首页', text: '首', path: '/home' },
  { key: 'workspace', label: '工作台', text: '工', path: '/workspace' },
]

const AppLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const initialKey: NavKey = location.pathname.includes('workspace')
    ? 'workspace'
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

  return (
    <div className={styles.page}>
      <div className={styles.window}>
        <aside className={styles.sidebar}>
          <div className={styles.navTop}>
            {navItems.map((item) => {
              const isActive = item.key === activeKey

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavClick(item)}
                  title={item.label}
                  className={`${styles.iconButton} ${isActive ? styles.iconButtonActive : ''}`}
                >
                  {item.text}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleProfileClick}
            className={`${styles.iconButton} ${styles.avatarButton} ${activeKey === 'profile' ? styles.avatarButtonActive : ''}`}
            title="个人中心"
          >
            个
          </button>
        </aside>

        <main className={styles.mainContent}>
          <Outlet context={{ activeKey }} />
        </main>
      </div>
    </div>
  )
}

export default AppLayout