/**
 * 个人中心页面
 *
 * 布局：左侧 Tab 纵向列表 + 右侧内容区
 * Tab 显隐条件基于用户的团队/企业/角色数据
 */

import { useState, useEffect, useMemo } from 'react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { UserOutlined, TeamOutlined, BankOutlined, AuditOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'
import { getMyEnterprises, getTeams } from '@/api/org'
import BasicInfoTab from './BasicInfoTab'
import MyTeamTab from './MyTeamTab'
import MyEnterpriseTab from './MyEnterpriseTab'
import ApprovalCenterTab from './ApprovalCenterTab'
import styles from './profile.module.css'

type TabKey = 'basic' | 'team' | 'enterprise' | 'approval'

interface TabConfig {
  key: TabKey
  label: string
  icon: React.ReactNode
  visible: boolean
}

const Profile = () => {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  const enterprises = useUserStore((s) => s.enterprises)
  const currentEnterpriseId = useUserStore((s) => s.currentEnterpriseId)
  const currentTeamId = useUserStore((s) => s.currentTeamId)
  const setEnterprises = useUserStore((s) => s.setEnterprises)
  const setTeams = useUserStore((s) => s.setTeams)

  const [activeTab, setActiveTab] = useState<TabKey>('basic')

  const currentEnterprise = useMemo(
    () => enterprises.find((e) => e.enterpriseId === currentEnterpriseId),
    [enterprises, currentEnterpriseId],
  )

  const userRole = currentEnterprise?.role || 'member'
  const isTeamAdmin = userRole === 'owner' || userRole === 'admin'
  const isEnterpriseAdmin = userRole === 'owner' || userRole === 'admin'

  /* ============================
      加载企业列表 + 团队列表
   ============================ */
  useEffect(() => {
    const loadData = async () => {
      try {
        const entRes = await getMyEnterprises()
        if (Array.isArray(entRes)) {
          setEnterprises(entRes)
        }
      } catch {
        message.error('加载企业列表失败')
      }
    }
    loadData()
  }, [setEnterprises])

  useEffect(() => {
    if (!currentEnterpriseId) {
      setTeams([])
      return
    }
    const loadTeams = async () => {
      try {
        const res = await getTeams()
        if (Array.isArray(res)) {
          setTeams(res)
        }
      } catch {
        // TODO: 后端未实现 GET /org/teams 接口
        console.warn('[MOCK] 使用模拟团队数据，后端接口未实现')
        setTeams([{ _id: 't1', enterpriseId: currentEnterpriseId, name: '默认团队' }])
      }
    }
    loadTeams()
  }, [currentEnterpriseId, setTeams])

  /* ============================
      计算 Tab 显隐
   ============================ */
  const visibleTabs: TabConfig[] = useMemo(() => {
    const hasTeam = !!currentTeamId
    const hasEnterprise = enterprises.length > 0
    const canAccessApproval = userRole === 'admin' || userRole === 'owner'

    const tabs: TabConfig[] = [
      { key: 'basic', label: '基础信息', icon: <UserOutlined />, visible: true },
      { key: 'team', label: '我的团队', icon: <TeamOutlined />, visible: hasTeam },
      {
        key: 'enterprise',
        label: '我的企业',
        icon: <BankOutlined />,
        visible: hasEnterprise,
      },
      {
        key: 'approval',
        label: '审批中心',
        icon: <AuditOutlined />,
        visible: canAccessApproval,
      },
    ]
    return tabs.filter((t) => t.visible)
  }, [currentTeamId, enterprises.length, userRole])

  /* ============================
      Tab 切换时确保当前 Tab 可见
   ============================ */
  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === activeTab)) {
      setActiveTab('basic')
    }
  }, [visibleTabs, activeTab])

  /* ============================
      退出登录
   ============================ */
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  /* ============================
      渲染 Tab 内容
   ============================ */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return <BasicInfoTab />
      case 'team':
        return <MyTeamTab isAdmin={isTeamAdmin} />
      case 'enterprise':
        return <MyEnterpriseTab isAdmin={isEnterpriseAdmin} />
      case 'approval':
        return <ApprovalCenterTab />
      default:
        return null
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        {/* 左侧 Tab 列表 */}
        <nav className={styles.sideNav}>
          <div className={styles.navHeader}>个人中心</div>
          <ul className={styles.navList}>
            {visibleTabs.map((tab) => (
              <li
                key={tab.key}
                className={`${styles.navItem} ${activeTab === tab.key ? styles.navItemActive : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className={styles.navIcon}>{tab.icon}</span>
                <span className={styles.navLabel}>{tab.label}</span>
              </li>
            ))}
          </ul>

          <div className={styles.navFooter}>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </nav>

        {/* 右侧内容区 */}
        <main className={styles.contentArea}>{renderTabContent()}</main>
      </div>
    </div>
  )
}

export default Profile
