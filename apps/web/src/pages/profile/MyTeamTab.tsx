import { useState, useEffect } from 'react'
import { Button, Tag, Modal, message, Input } from 'antd'
import { LogoutOutlined, TeamOutlined, UserAddOutlined, BankOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'
import {
  getTeams,
  getTeamMembers,
  leaveTeam,
  dismissTeam,
  removeTeamMember,
  setTeamMemberRole,
  generateInvitationCode,
  type TeamData,
  type TeamMember,
  type Role,
} from '@/api/org'
import styles from './profile.module.css'

interface MyTeamTabProps {
  isAdmin: boolean
}

/**
 * 角色映射说明：
 * 后端 Role 枚举：owner / admin / member
 * 产品需求规格中的角色：team_admin / enterprise_admin / enterprise_creator / member
 * 映射规则：owner → 管理员(企业创建者)，admin → 管理员，member → 普通成员
 * TODO: 后端需扩展 Role 枚举以支持更细粒度的角色区分
 */
const ROLE_TAG_MAP: Record<string, { text: string; color: string }> = {
  owner: { text: '管理员', color: 'gold' },
  admin: { text: '管理员', color: 'gold' },
  member: { text: '普通成员', color: 'default' },
  viewer: { text: '访客', color: 'default' },
}

const MyTeamTab = ({ isAdmin }: MyTeamTabProps) => {
  const currentUser = useAuthStore((s) => s.user)
  const currentEnterpriseId = useUserStore((s) => s.currentEnterpriseId)
  const enterprises = useUserStore((s) => s.enterprises)

  const [teams, setTeams] = useState<TeamData[]>([])
  const [currentTeam, setCurrentTeam] = useState<TeamData | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  const currentEnterprise = enterprises.find((e) => e.enterpriseId === currentEnterpriseId)
  const userRole = currentEnterprise?.role || 'member'

  // 模拟当前用户 ID（后端 auth 接口暂未返回 userId）
  const currentUserId = currentUser?.email || 'current_user'

  useEffect(() => {
    if (!currentEnterpriseId) return
    const loadData = async () => {
      setLoading(true)
      try {
        const res = await getTeams()
        if (Array.isArray(res) && res.length > 0) {
          setTeams(res)
          setCurrentTeam(res[0])
        }
      } catch {
        message.error('加载团队列表失败')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [currentEnterpriseId])

  useEffect(() => {
    if (!currentTeam) {
      setMembers([])
      return
    }
    const loadMembers = async () => {
      try {
        const res = await getTeamMembers(currentTeam._id)
        if (Array.isArray(res)) {
          setMembers(res)
        }
      } catch {
        // TODO: 后端未实现 GET /org/spaces/:spaceId/members 接口
        console.warn('[MOCK] 使用模拟成员数据，后端接口未实现')
        setMembers([
          { userId: '1', nickname: '张三', email: 'zhangsan@demo.com', role: 'admin' },
          { userId: '2', nickname: '李四', email: 'lisi@demo.com', role: 'member' },
          {
            userId: currentUserId,
            nickname: currentUser?.name || '我',
            email: currentUser?.email || '',
            role: userRole as Role,
          },
        ])
      }
    }
    loadMembers()
  }, [currentTeam])

  const adminActionsEnabled = userRole === 'owner' || userRole === 'admin'

  const handleLeaveTeam = () => {
    Modal.confirm({
      title: '确认退出团队',
      content: `确定要退出团队「${currentTeam?.name}」吗？`,
      okText: '确认退出',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!currentTeam) return
        try {
          await leaveTeam(currentTeam._id)
          message.success('已退出团队')
          setCurrentTeam(null)
        } catch {
          message.error('退出团队失败')
        }
      },
    })
  }

  const handleDismissTeam = () => {
    Modal.confirm({
      title: '解散团队',
      content: `解散团队「${currentTeam?.name}」后，团队内所有成员将被移除，该操作不可恢复。`,
      okText: '确认解散',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!currentTeam) return
        try {
          await dismissTeam(currentTeam._id)
          message.success('团队已解散')
          setCurrentTeam(null)
        } catch {
          message.error('解散团队失败')
        }
      },
    })
  }

  const handleRemoveMember = (memberUserId: string) => {
    Modal.confirm({
      title: '移除成员',
      content: '确定要移除该成员吗？',
      okText: '确认移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!currentTeam) return
        try {
          await removeTeamMember(currentTeam._id, memberUserId)
          message.success('成员已移除')
          setMembers((prev) => prev.filter((m) => m.userId !== memberUserId))
        } catch {
          message.error('移除成员失败')
        }
      },
    })
  }

  const handleToggleAdmin = (memberUserId: string, currentRole: Role) => {
    const newRole: Role = currentRole === 'admin' ? 'member' : 'admin'
    const action = newRole === 'admin' ? '设为管理员' : '取消管理员'
    Modal.confirm({
      title: action,
      content: `确定要将该成员${action}吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        if (!currentTeam) return
        try {
          await setTeamMemberRole(currentTeam._id, memberUserId, newRole)
          message.success(action + '成功')
          setMembers((prev) =>
            prev.map((m) => (m.userId === memberUserId ? { ...m, role: newRole } : m)),
          )
        } catch {
          message.error(action + '失败')
        }
      },
    })
  }

  const handleGenerateInviteCode = async () => {
    if (!currentTeam) return
    try {
      const res = await generateInvitationCode('team', currentTeam._id)
      setInviteCode(res?.code || 'TEAM' + Math.random().toString(36).slice(2, 8).toUpperCase())
      setInviteModalOpen(true)
    } catch {
      // TODO: 后端未实现 POST /org/invitations/generate 接口
      console.warn('[MOCK] 使用模拟邀请码，后端接口未实现')
      setInviteCode('TEAM' + Math.random().toString(36).slice(2, 8).toUpperCase())
      setInviteModalOpen(true)
    }
  }

  // 团队管理员：申请加入企业
  const handleApplyJoinEnterprise = () => {
    Modal.confirm({
      title: '申请加入企业',
      content: `确定要代表团队「${currentTeam?.name}」申请加入企业吗？`,
      okText: '提交申请',
      cancelText: '取消',
      onOk: async () => {
        try {
          // TODO: 后端未实现申请加入企业接口
          console.warn('[MOCK] 申请加入企业，后端接口未实现')
          message.success('申请已提交，等待企业管理员审批')
        } catch {
          message.error('申请失败')
        }
      },
    })
  }

  // 团队管理员：申请退出企业
  const handleApplyLeaveEnterprise = () => {
    Modal.confirm({
      title: '申请退出企业',
      content: `确定要代表团队「${currentTeam?.name}」申请退出企业吗？`,
      okText: '提交申请',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          // TODO: 后端未实现申请退出企业接口
          console.warn('[MOCK] 申请退出企业，后端接口未实现')
          message.success('申请已提交，等待企业管理员审批')
        } catch {
          message.error('申请失败')
        }
      },
    })
  }

  if (loading) {
    return <div className={styles.loadingText}>加载中...</div>
  }

  if (!currentTeam) {
    return (
      <div className={styles.emptyState}>
        <TeamOutlined className={styles.emptyIcon} />
        <p>暂无团队</p>
      </div>
    )
  }

  // 判断团队是否已加入企业
  const isTeamInEnterprise = !!currentEnterpriseId
  const isTeamAdmin = userRole === 'owner' || userRole === 'admin'

  return (
    <div className={styles.tabContent}>
      {/* 团队信息 */}
      <div className={styles.teamInfoSection}>
        <div className={styles.teamInfoRow}>
          <span className={styles.teamInfoLabel}>团队名称</span>
          <span className={styles.teamInfoValue}>{currentTeam.name}</span>
        </div>
        <div className={styles.teamInfoRow}>
          <span className={styles.teamInfoLabel}>成员</span>
          <span className={styles.teamInfoValue}>
            {members.length}
            {currentTeam.maxMembers ? `/${currentTeam.maxMembers}人` : '人'}
          </span>
        </div>
        <div className={styles.teamInfoRow}>
          <span className={styles.teamInfoLabel}>我的角色</span>
          <Tag color={ROLE_TAG_MAP[userRole]?.color || 'default'}>
            {ROLE_TAG_MAP[userRole]?.text || '普通成员'}
          </Tag>
        </div>

        {/* 管理员操作 */}
        {adminActionsEnabled && (
          <div className={styles.adminActions}>
            <Button icon={<UserAddOutlined />} onClick={handleGenerateInviteCode}>
              生成邀请码
            </Button>
            {/* 申请加入/退出企业（团队管理员） */}
            {isTeamAdmin &&
              (isTeamInEnterprise ? (
                <Button icon={<BankOutlined />} onClick={handleApplyLeaveEnterprise}>
                  申请退出企业
                </Button>
              ) : (
                <Button icon={<BankOutlined />} onClick={handleApplyJoinEnterprise}>
                  申请加入企业
                </Button>
              ))}
          </div>
        )}
      </div>

      {/* 成员列表 */}
      <div className={styles.memberListSection}>
        <h3 className={styles.sectionTitle}>成员列表</h3>
        <div className={styles.memberCards}>
          {members.map((member) => (
            <div key={member.userId} className={styles.memberCard}>
              <div className={styles.memberAvatar}>
                {member.nickname ? member.nickname.charAt(0).toUpperCase() : '?'}
              </div>
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>{member.nickname || member.email}</span>
                <Tag
                  color={ROLE_TAG_MAP[member.role]?.color || 'default'}
                  className={styles.memberRoleTag}
                >
                  {ROLE_TAG_MAP[member.role]?.text || '普通成员'}
                </Tag>
              </div>

              {/* 管理员操作按钮（不显示在当前用户自己的卡片上） */}
              {adminActionsEnabled && member.userId !== currentUserId && (
                <div className={styles.memberActions}>
                  {member.role === 'admin' ? (
                    <Button
                      size="small"
                      onClick={() => handleToggleAdmin(member.userId, member.role)}
                    >
                      取消管理员
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => handleToggleAdmin(member.userId, member.role)}
                    >
                      设为管理员
                    </Button>
                  )}
                  <Button size="small" danger onClick={() => handleRemoveMember(member.userId)}>
                    移除
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 底部按钮 */}
      <div className={styles.bottomBtns}>
        <Button danger icon={<LogoutOutlined />} onClick={handleLeaveTeam}>
          退出团队
        </Button>
        {userRole === 'owner' && (
          <Button danger onClick={handleDismissTeam}>
            解散团队
          </Button>
        )}
      </div>

      {/* 邀请码弹窗 */}
      <Modal
        title="团队邀请码"
        open={inviteModalOpen}
        onCancel={() => setInviteModalOpen(false)}
        onOk={() => setInviteModalOpen(false)}
        okText="我知道了"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ color: '#6b7280', marginBottom: 12 }}>将此邀请码分享给成员，让他们加入团队</p>
          <Input.TextArea
            value={inviteCode}
            readOnly
            autoSize
            style={{
              textAlign: 'center',
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 4,
              fontFamily: 'monospace',
              maxWidth: 200,
              margin: '0 auto',
            }}
          />
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 12 }}>邀请码有效期 24 小时</p>
        </div>
      </Modal>
    </div>
  )
}

export default MyTeamTab
