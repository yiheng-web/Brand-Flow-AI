import { useState } from 'react'
import { Button, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'
import InviteModal from './InviteModal'
import styles from './profile.module.css'

/** 脱敏显示邮箱：如 user***@domain.com */
const maskEmail = (email: string) => {
  if (!email || !email.includes('@')) return email
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}${local[1]}***@${domain}`
}

interface BasicInfoTabProps {
  onNicknameChange?: () => void
}

const BasicInfoTab = ({ onNicknameChange }: BasicInfoTabProps) => {
  const user = useAuthStore((s) => s.user)
  const enterprises = useUserStore((s) => s.enterprises)
  const currentEnterpriseId = useUserStore((s) => s.currentEnterpriseId)

  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteType, setInviteType] = useState<'team' | 'enterprise'>('team')

  const currentEnterprise = enterprises.find((e) => e.enterpriseId === currentEnterpriseId)
  const userRole = currentEnterprise?.role || 'member'

  const roleText: Record<string, string> = {
    owner: '所有者',
    admin: '管理员',
    member: '普通成员',
    viewer: '访客',
  }

  const handleJoinTeam = () => {
    setInviteType('team')
    setInviteModalOpen(true)
  }

  const handleJoinEnterprise = () => {
    setInviteType('enterprise')
    setInviteModalOpen(true)
  }

  const handleNicknameEdit = () => {
    message.info('编辑昵称功能待对接后端接口')
    onNicknameChange?.()
  }

  return (
    <div className={styles.tabContent}>
      {/* 头像 + 昵称 + 账号 */}
      <div className={styles.avatarSection}>
        <div className={styles.avatarLarge}>
          {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
        </div>
        <div className={styles.userMeta}>
          <div className={styles.nicknameRow}>
            <span className={styles.nickname}>{user?.name || '未设置昵称'}</span>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={handleNicknameEdit}
              className={styles.editBtn}
            />
          </div>
          <div className={styles.accountLine}>
            <span className={styles.accountLabel}>账号：</span>
            <span className={styles.accountValue}>{maskEmail(user?.email || '')}</span>
          </div>
        </div>
      </div>

      {/* 组织关系 */}
      <div className={styles.orgSection}>
        <div className={styles.orgRow}>
          <span className={styles.orgLabel}>组织关系</span>
          <span className={styles.orgValue}>
            {currentEnterprise ? (
              <>
                <span className={styles.orgTeamName}>{currentEnterprise.name}</span>
                <span className={styles.orgSep}>·</span>
                <span className={styles.orgRole}>{roleText[userRole] || '普通成员'}</span>
              </>
            ) : (
              <span className={styles.orgEmpty}>暂无</span>
            )}
          </span>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className={styles.bottomBtns}>
        <Button type="primary" size="large" onClick={handleJoinTeam}>
          加入团队
        </Button>
        <Button size="large" onClick={handleJoinEnterprise}>
          加入企业
        </Button>
      </div>

      <InviteModal
        open={inviteModalOpen}
        type={inviteType}
        onClose={() => setInviteModalOpen(false)}
      />
    </div>
  )
}

export default BasicInfoTab
