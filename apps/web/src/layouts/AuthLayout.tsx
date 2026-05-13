import { Outlet } from 'react-router-dom'
import styles from './AuthLayout.module.css'

const AuthLayout = () => {
  return (
    <div className={styles.page}>
      <div className={styles.window}>
        <Outlet />
      </div>
    </div>
  )
}

export default AuthLayout