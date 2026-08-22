import { useEffect, useState } from 'react'
import {
  ApartmentOutlined,
  LogoutOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, message } from 'antd'
import { useNavigate } from 'react-router-dom'

import { getMyEnterprises } from '@/api/org'
import { PageHeader } from '@/design-system/components'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'

import styles from './profile.module.css'

const Profile = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const spaces = useUserStore((state) => state.spaces)
  const currentSpaceName = useUserStore((state) => state.currentSpaceName)
  const enterprises = useUserStore((state) => state.enterprises)
  const setEnterprises = useUserStore((state) => state.setEnterprises)
  const [loadingOrganizations, setLoadingOrganizations] = useState(true)
  const enterpriseCount = new Set(enterprises.map((enterprise) => enterprise.enterpriseId)).size

  useEffect(() => {
    let active = true
    getMyEnterprises()
      .then((data) => {
        if (active) setEnterprises(data)
      })
      .catch(() => {
        if (active) message.error('加载组织信息失败')
      })
      .finally(() => {
        if (active) setLoadingOrganizations(false)
      })
    return () => {
      active = false
    }
  }, [setEnterprises])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const avatarChar = user?.name?.slice(0, 1).toUpperCase() || '?'

  return (
    <div className={styles.page}>
      <PageHeader title="个人中心" description="管理账号信息、所属组织和登录状态" />

      <section className={styles.profileHero}>
        <span className={styles.avatar}>{avatarChar}</span>
        <div>
          <small>BrandFlow 账号</small>
          <h2>{user?.name || '未设置昵称'}</h2>
          <p>{user?.email || '未绑定邮箱'}</p>
        </div>
        <span className={styles.accountStatus}>
          <i /> 已登录
        </span>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <UserOutlined />
            <div>
              <h2>账号信息</h2>
              <p>资料来自当前登录账号</p>
            </div>
          </div>
          <dl className={styles.infoList}>
            <div>
              <dt>
                <UserOutlined /> 姓名
              </dt>
              <dd>{user?.name || '未设置'}</dd>
            </div>
            <div>
              <dt>
                <MailOutlined /> 邮箱
              </dt>
              <dd>{user?.email || '未绑定'}</dd>
            </div>
            <div>
              <dt>
                <SafetyCertificateOutlined /> 账号 ID
              </dt>
              <dd className={styles.userId}>{user?.id || '—'}</dd>
            </div>
          </dl>
          <p className={styles.readonlyNotice}>当前版本暂不支持在线修改账号资料。</p>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <ApartmentOutlined />
            <div>
              <h2>组织与空间</h2>
              <p>当前使用：{currentSpaceName}</p>
            </div>
          </div>
          <div className={styles.organizationSummary}>
            <div>
              <span>
                <ApartmentOutlined />
              </span>
              <p>
                <b>{loadingOrganizations ? '—' : enterpriseCount}</b>
                <small>所属企业</small>
              </p>
            </div>
            <div>
              <span>
                <TeamOutlined />
              </span>
              <p>
                <b>{spaces.length}</b>
                <small>可用空间</small>
              </p>
            </div>
          </div>
          <Button type="primary" block onClick={() => navigate('/organization')}>
            查看组织详情
          </Button>
        </section>
      </div>

      <section className={styles.dangerZone}>
        <div>
          <h2>退出当前账号</h2>
          <p>退出后需要重新登录才能访问个人空间与企业内容。</p>
        </div>
        <Button danger icon={<LogoutOutlined />} onClick={handleLogout}>
          退出登录
        </Button>
      </section>
    </div>
  )
}

export default Profile
