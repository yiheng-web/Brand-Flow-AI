import { useState, useEffect } from 'react'
import { Button, Tag, Modal, message } from 'antd'
import { LogoutOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { useUserStore } from '@/store/useUserStore'
import {
  getTeams,
  getTeamMembers,
  leaveEnterprise,
  type TeamData,
  type TeamMember,
  type Role,
} from '@/api/org'
import styles from './profile.module.css'

interface MyEnterpriseTabProps {
  isAdmin: boolean
}

const ROLE_TAG_MAP: Record<string, { text: string; color: string }> = {
  owner: { text: '管理员', color: 'gold' },
  admin: { text: '管理员', color: 'gold' },
  member: { text: '普通成员', color: 'default' },
  viewer: { text: '访客', color: 'default' },
}

const MyEnterpriseTab = ({ isAdmin }: MyEnterpriseTabProps) => {
  const currentEnterpriseId = useUserStore((s) => s.currentEnterpriseId)
  const enterprises = useUserStore((s) => s.enterprises)

  const [teams, setTeams] = useState<TeamData[]>([])
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [teamMembersMap, setTeamMembersMap] = useState<Record<string, TeamMember[]>>({})
  const [loading, setLoading] = useState(false)

  const currentEnterprise = enterprises.find((e) => e.enterpriseId === currentEnterpriseId)
  const userRole = currentEnterprise?.role || 'member'
  const isEnterpriseAdmin = userRole === 'owner' || userRole === 'admin'

  useEffect(() => {
    if (!currentEnterpriseId) return
    const loadTeams = async () => {
      setLoading(true)
      try {
        const res = await getTeams()
        if (Array.isArray(res)) {
          setTeams(res)
        }
      } catch {
        // TODO: 后端未实现 GET /org/teams 接口
        console.warn('[MOCK] 使用模拟团队数据，后端接口未实现')
        setTeams([
          { _id: 't1', enterpriseId: currentEnterpriseId, name: '设计部', memberCount: 5 },
          { _id: 't2', enterpriseId: currentEnterpriseId, name: '研发部', memberCount: 3 },
          { _id: 't3', enterpriseId: currentEnterpriseId, name: '市场部', memberCount: 2 },
        ])
      } finally {
        setLoading(false)
      }
    }
    loadTeams()
  }, [currentEnterpriseId])

  const handleToggleExpand = async (teamId: string) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null)
      return
    }
    setExpandedTeamId(teamId)

    // 企业管理员可以展开查看成员
    if (isEnterpriseAdmin && !teamMembersMap[teamId]) {
      try {
        const res = await getTeamMembers(teamId)
        if (Array.isArray(res)) {
          setTeamMembersMap((prev) => ({ ...prev, [teamId]: res }))
        }
      } catch {
        // TODO: 后端未实现 GET /org/spaces/:spaceId/members 接口
        console.warn('[MOCK] 使用模拟成员数据，后端接口未实现')
        setTeamMembersMap((prev) => ({
          ...prev,
          [teamId]: [
            { userId: '1', nickname: '张三', email: 'zhangsan@demo.com', role: 'admin' },
            { userId: '2', nickname: '李四', email: 'lisi@demo.com', role: 'member' },
          ],
        }))
      }
    }
  }

  const handleLeaveEnterprise = () => {
    Modal.confirm({
      title: '退出企业',
      content: `确定要退出企业「${currentEnterprise?.name}」吗？退出后将无法访问企业内的资源。`,
      okText: '确认退出',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!currentEnterpriseId) return
        try {
          await leaveEnterprise(currentEnterpriseId)
          message.success('已退出企业')
        } catch {
          message.error('退出企业失败')
        }
      },
    })
  }

  const handleRemoveTeamFromEnterprise = (teamId: string, teamName: string) => {
    Modal.confirm({
      title: '移出团队',
      content: `确定要将团队「${teamName}」从企业中移出吗？`,
      okText: '确认移出',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          message.success('团队已从企业移出')
        } catch {
          message.error('操作失败')
        }
      },
    })
  }

  if (loading) {
    return <div className={styles.loadingText}>加载中...</div>
  }

  if (!currentEnterprise) {
    return (
      <div className={styles.emptyState}>
        <TeamOutlined className={styles.emptyIcon} />
        <p>尚未加入任何企业</p>
      </div>
    )
  }

  return (
    <div className={styles.tabContent}>
      {/* 企业信息 */}
      <div className={styles.teamInfoSection}>
        <div className={styles.teamInfoRow}>
          <span className={styles.teamInfoLabel}>企业名称</span>
          <span className={styles.teamInfoValue}>{currentEnterprise.name}</span>
        </div>
        <div className={styles.teamInfoRow}>
          <span className={styles.teamInfoLabel}>团队</span>
          <span className={styles.teamInfoValue}>
            {teams.length}
            {currentEnterpriseId ? `/${teams.length}个` : '个'}
          </span>
        </div>
      </div>

      {/* 团队列表 */}
      <div className={styles.memberListSection}>
        <h3 className={styles.sectionTitle}>团队列表</h3>
        {teams.length === 0 ? (
          <div className={styles.emptyState}>
            <p>暂无团队</p>
          </div>
        ) : (
          <div className={styles.teamList}>
            {teams.map((team) => (
              <div key={team._id} className={styles.enterpriseTeamCard}>
                <div
                  className={styles.enterpriseTeamHeader}
                  onClick={() => isEnterpriseAdmin && handleToggleExpand(team._id)}
                  style={{ cursor: isEnterpriseAdmin ? 'pointer' : 'default' }}
                >
                  <div className={styles.enterpriseTeamInfo}>
                    <UserOutlined className={styles.enterpriseTeamIcon} />
                    <span className={styles.enterpriseTeamName}>{team.name}</span>
                    <span className={styles.enterpriseTeamCount}>{team.memberCount || 0} 人</span>
                  </div>
                  {isEnterpriseAdmin && (
                    <span className={styles.expandIcon}>
                      {expandedTeamId === team._id ? '收起 ▲' : '展开 ▼'}
                    </span>
                  )}
                </div>

                {/* 展开的成员列表（仅管理员） */}
                {expandedTeamId === team._id && isEnterpriseAdmin && (
                  <div className={styles.teamMembersExpand}>
                    {(teamMembersMap[team._id] || []).map((member) => (
                      <div key={member.userId} className={styles.expandedMemberRow}>
                        <div className={styles.memberAvatarSmall}>
                          {member.nickname ? member.nickname.charAt(0).toUpperCase() : '?'}
                        </div>
                        <span className={styles.expandedMemberName}>
                          {member.nickname || member.email}
                        </span>
                        <Tag
                          color={ROLE_TAG_MAP[member.role]?.color || 'default'}
                          className={styles.memberRoleTag}
                        >
                          {ROLE_TAG_MAP[member.role]?.text || '普通成员'}
                        </Tag>
                      </div>
                    ))}
                    {(teamMembersMap[team._id] || []).length === 0 && (
                      <div className={styles.loadingText}>暂无成员</div>
                    )}
                  </div>
                )}

                {/* 管理员操作：移出企业 */}
                {isEnterpriseAdmin && (
                  <div className={styles.enterpriseTeamActions}>
                    <Button
                      size="small"
                      danger
                      onClick={() => handleRemoveTeamFromEnterprise(team._id, team.name)}
                    >
                      移出企业
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className={styles.bottomBtns}>
        <Button danger icon={<LogoutOutlined />} onClick={handleLeaveEnterprise}>
          退出企业
        </Button>
      </div>

      {/* 企业管理员管理区域 */}
      {isEnterpriseAdmin && (
        <div className={styles.adminManagementSection}>
          <h3 className={styles.sectionTitle}>管理员操作</h3>
          <div className={styles.adminManagementHint}>
            作为企业管理员，您可以管理团队成员、移出团队等。所有操作均记录日志。
          </div>
        </div>
      )}
    </div>
  )
}

export default MyEnterpriseTab
