import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import styles from './BasicLayout.module.css'

const BasicLayout: React.FC = () => {
  return (
    <div>
      <header className={styles.header}>
        <nav className={styles.navigation}>
          <NavLink to="/home">首页</NavLink>
          <NavLink to="/workspace">工作台</NavLink>
        </nav>
      </header>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
export default BasicLayout
