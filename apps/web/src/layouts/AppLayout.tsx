import { Outlet } from 'react-router-dom'

import { NavRail } from '@/components/NavRail'

import styles from './AppLayout.module.css'

export default function AppLayout() {
  return (
    <div className={styles.window}>
      <NavRail />
      <main className={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  )
}
