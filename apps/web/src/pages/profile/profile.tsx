/**
 * 个人中心页面
 *
 * 功能说明：
 * - 顶部展示用户个人信息（头像、昵称、邮箱）
 * - 企业/空间切换（从 /org/enterprises 动态加载）
 * - 团队管理（从 /org/teams 加载，支持创建团队）
 * - 底部退出登录
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Select, Tag, Card, message, Modal, Input as AntInput } from 'antd'
import { useNavigate } from 'react-router-dom'
import { LogoutOutlined, PlusOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'
import { getMyEnterprises, switchEnterprise, getTeams, createTeam } from '@/api/org'
import type { TeamData } from '@/api/org'
import styles from './profile.module.css'

/** 角色标签映射 */
const ROLE_TAG_MAP: Record<string, { text: string; color: string }> = {
  owner: { text: '所有者', color: 'gold' },
  admin: { text: '管理员', color: 'blue' },
  member: { text: '成员', color: 'default' },
  viewer: { text: '访客', color: 'default' },
}

const Profile = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  // 企业相关
  const currentEnterpriseId = useUserStore((state) => state.currentEnterpriseId)
  const enterprises = useUserStore((state) => state.enterprises)
  const setCurrentEnterpriseId = useUserStore((state) => state.setCurrentEnterpriseId)
  const setEnterprises = useUserStore((state) => state.setEnterprises)

  // 团队列表
  const [teams, setTeams] = useState<TeamData[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)

  // 创建团队弹窗
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)

  /** 当前企业的角色 */
  const currentRoleTag =
    enterprises.find((e) => e.enterpriseId === currentEnterpriseId)?.role || 'member'

  /* ============================
      加载企业列表
   ============================ */
  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        const res = await getMyEnterprises()
        if (res.data && Array.isArray(res.data)) {
          setEnterprises(res.data)
        }
      } catch {
        message.error('加载企业列表失败')
      }
    }
    loadEnterprises()
  }, [setEnterprises])

  /* ============================
      加载团队列表
   ============================ */
  const loadTeams = useCallback(async () => {
    if (!currentEnterpriseId) return
    setLoadingTeams(true)
    try {
      const res = await getTeams()
      if (res.data && Array.isArray(res.data)) {
        setTeams(res.data)
      }
    } catch {
      message.error('加载团队列表失败')
    } finally {
      setLoadingTeams(false)
    }
  }, [currentEnterpriseId])

  useEffect(() => {
    queueMicrotask(() => void loadTeams())
  }, [loadTeams])

  /* ============================
      切换企业
   ============================ */
  const handleSwitchEnterprise = async (enterpriseId: string) => {
    setCurrentEnterpriseId(enterpriseId)
    try {
      await switchEnterprise(enterpriseId)
    } catch {
      message.error('切换企业失败')
    }
  }

  /* ============================
      创建团队
   ============================ */
  const handleCreateTeam = async () => {
    const name = teamName.trim()
    if (!name) {
      message.warning('请输入团队名称')
      return
    }

    setCreatingTeam(true)
    try {
      await createTeam({ name, description: teamDesc.trim() || undefined })
      message.success('团队创建成功')
      setCreateTeamModalOpen(false)
      setTeamName('')
      setTeamDesc('')
      loadTeams()
    } catch {
      message.error('创建团队失败，请稍后重试')
    } finally {
      setCreatingTeam(false)
    }
  }

  /* ============================
      退出登录
   ============================ */
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  /* ============================
      头像首字
   ============================ */
  const avatarChar = user?.name ? user.name.charAt(0).toUpperCase() : '?'

  /* ============================
      格式化日期
   ============================ */
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        {/* ====== 个人信息区 ====== */}
        <div className={styles.profileCard}>
          <div className={styles.profileAvatar}>{avatarChar}</div>
          <div className={styles.profileInfo}>
            <span className={styles.profileName}>{user?.name || '未设置昵称'}</span>
            <span className={styles.profileEmail}>{user?.email || '-'}</span>
          </div>
        </div>

        {/* ====== 企业/空间切换区 ====== */}
        <div className={styles.headerSection}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>当前所在企业</span>
            <Select
              value={currentEnterpriseId}
              onChange={handleSwitchEnterprise}
              className={styles.spaceSelect}
              options={
                enterprises.length > 0
                  ? enterprises.map((ent) => ({
                      value: ent.enterpriseId,
                      label: ent.name,
                    }))
                  : [{ value: '', label: '暂无企业' }]
              }
            />
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>我的角色</span>
            <Tag color={ROLE_TAG_MAP[currentRoleTag]?.color || 'default'}>
              {ROLE_TAG_MAP[currentRoleTag]?.text || '成员'}
            </Tag>
          </div>
        </div>

        {/* ====== 团队管理区 ====== */}
        <div className={styles.memberSection}>
          <div className={styles.memberHeader}>
            <h2 className={styles.memberTitle}>团队列表</h2>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateTeamModalOpen(true)}
              disabled={!currentEnterpriseId}
            >
              创建团队
            </Button>
          </div>

          <div className={styles.memberList}>
            {loadingTeams ? (
              <div className={styles.loadingText}>加载中...</div>
            ) : teams.length === 0 ? (
              <div className={styles.loadingText}>暂无团队，点击上方按钮创建</div>
            ) : (
              teams.map((team) => (
                <Card key={team._id} className={styles.teamItem} size="small">
                  <div className={styles.teamItemContent}>
                    <div className={styles.teamItemLeft}>
                      <span className={styles.teamName}>{team.name}</span>
                      {team.description && (
                        <span className={styles.teamDesc}>{team.description}</span>
                      )}
                    </div>
                    <span className={styles.teamDate}>{formatDate(team.createdAt)}</span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* ====== 退出登录 ====== */}
        <div className={styles.footerSection}>
          <Button danger icon={<LogoutOutlined />} onClick={handleLogout}>
            退出登录
          </Button>
        </div>
      </div>

      {/* 创建团队弹窗 */}
      <Modal
        title="创建团队"
        open={createTeamModalOpen}
        onCancel={() => {
          setCreateTeamModalOpen(false)
          setTeamName('')
          setTeamDesc('')
        }}
        onOk={handleCreateTeam}
        confirmLoading={creatingTeam}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className={styles.formLabel}>团队名称 *</label>
            <AntInput
              placeholder="请输入团队名称（不超过50字）"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={50}
            />
          </div>
          <div>
            <label className={styles.formLabel}>描述（选填）</label>
            <AntInput.TextArea
              placeholder="请输入团队描述（不超过200字）"
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              maxLength={200}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Profile
