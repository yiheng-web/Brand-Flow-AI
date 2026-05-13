import { Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import styles from './profile.module.css'

const ProfilePage = () => {
  const navigate = useNavigate()
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <Button type="primary" danger className={styles.logoutButton} onClick={handleLogout}>
          退出登录
        </Button>
      </div>
    </div>
  )
}

export default ProfilePage