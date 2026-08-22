import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApartmentOutlined,
  MailOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Input, Modal, Select, Tag, message } from 'antd'

import {
  createTeam,
  getMyEnterprises,
  getSpaceMembers,
  getTeams,
  inviteSpaceMember,
  switchEnterprise,
  type Role,
  type SpaceMemberData,
  type TeamData,
} from '@/api/org'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'

import styles from './organization.module.css'

const ROLE_LABELS: Record<Role, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '访客',
}
const ROLE_WEIGHT: Record<Role, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }

const OrganizationPage = () => {
  const setToken = useAuthStore((state) => state.setToken)
  const spaces = useUserStore((state) => state.spaces)
  const currentSpaceId = useUserStore((state) => state.currentSpaceId) || 'personal'
  const currentSpaceName = useUserStore((state) => state.currentSpaceName)
  const currentSpaceType = useUserStore((state) => state.currentSpaceType)
  const currentEnterpriseId = useUserStore((state) => state.currentEnterpriseId)
  const enterprises = useUserStore((state) => state.enterprises)
  const setCurrentSpace = useUserStore((state) => state.setCurrentSpace)
  const setCurrentEnterpriseId = useUserStore((state) => state.setCurrentEnterpriseId)
  const setEnterprises = useUserStore((state) => state.setEnterprises)
  const [members, setMembers] = useState<SpaceMemberData[]>([])
  const [teams, setTeams] = useState<TeamData[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('member')
  const [inviting, setInviting] = useState(false)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [teamDescription, setTeamDescription] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)

  const currentSpace = useMemo(
    () => spaces.find((space) => space.id === currentSpaceId),
    [currentSpaceId, spaces],
  )
  const organizationEnterprises = useMemo(() => {
    const unique = new Map<string, (typeof enterprises)[number]>()
    for (const enterprise of enterprises) {
      const existing = unique.get(enterprise.enterpriseId)
      if (!existing || ROLE_WEIGHT[enterprise.role] > ROLE_WEIGHT[existing.role]) {
        unique.set(enterprise.enterpriseId, enterprise)
      }
    }
    return [...unique.values()]
  }, [enterprises])
  const enterpriseId = currentSpace?.enterpriseId || currentEnterpriseId
  const currentRole = organizationEnterprises.find(
    (item) => item.enterpriseId === enterpriseId,
  )?.role
  const canManage =
    currentSpaceType !== 'personal' && (currentRole === 'owner' || currentRole === 'admin')

  useEffect(() => {
    let active = true
    getMyEnterprises()
      .then((data) => {
        if (active) setEnterprises(data)
      })
      .catch(() => {
        if (active) message.error('加载企业列表失败')
      })
    return () => {
      active = false
    }
  }, [setEnterprises])

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true)
    try {
      setMembers(await getSpaceMembers(currentSpaceId))
      setMemberError(null)
    } catch (reason) {
      setMembers([])
      setMemberError(reason instanceof Error ? reason.message : '无法加载空间成员')
    } finally {
      setLoadingMembers(false)
    }
  }, [currentSpaceId])

  useEffect(() => {
    queueMicrotask(() => void loadMembers())
  }, [loadMembers])

  const loadTeams = useCallback(async () => {
    if (!enterpriseId) {
      setTeams([])
      return
    }
    setLoadingTeams(true)
    try {
      setTeams(await getTeams())
    } catch {
      setTeams([])
    } finally {
      setLoadingTeams(false)
    }
  }, [enterpriseId])

  useEffect(() => {
    queueMicrotask(() => void loadTeams())
  }, [loadTeams])

  const handleSwitchEnterprise = async (nextEnterpriseId: string) => {
    try {
      const result = await switchEnterprise(nextEnterpriseId)
      setToken(result.access_token)
      setCurrentEnterpriseId(nextEnterpriseId)
      if (spaces.some((space) => space.id === nextEnterpriseId)) {
        setCurrentSpace(nextEnterpriseId)
      }
    } catch {
      message.error('切换企业失败，请稍后重试')
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      message.warning('请输入成员邮箱')
      return
    }
    setInviting(true)
    try {
      await inviteSpaceMember(currentSpaceId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      message.success('成员已加入当前空间')
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('member')
      await loadMembers()
    } catch {
      message.error('邀请失败，请确认账号和管理权限')
    } finally {
      setInviting(false)
    }
  }

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      message.warning('请输入团队名称')
      return
    }
    setCreatingTeam(true)
    try {
      await createTeam({
        name: teamName.trim(),
        description: teamDescription.trim() || undefined,
      })
      message.success('团队创建成功')
      setCreateTeamOpen(false)
      setTeamName('')
      setTeamDescription('')
      await loadTeams()
    } catch {
      message.error('创建团队失败，请确认当前企业和管理权限')
    } finally {
      setCreatingTeam(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="组织详情"
        description="管理企业、团队空间和成员协作权限"
        actions={
          <Button
            type="primary"
            icon={<MailOutlined />}
            disabled={!canManage}
            onClick={() => setInviteOpen(true)}
          >
            邀请成员
          </Button>
        }
      />

      <section className={styles.organizationHero}>
        <span className={styles.organizationMark}>{currentSpaceName.slice(0, 1)}</span>
        <div>
          <small>{currentSpaceType === 'personal' ? '个人空间' : '当前协作空间'}</small>
          <h2>{currentSpaceName}</h2>
          <p>{currentSpace?.description || '当前空间的知识、资产和作品相互隔离。'}</p>
        </div>
        {currentRole && <Tag color="blue">{ROLE_LABELS[currentRole]}</Tag>}
      </section>

      <div className={styles.selectorGrid}>
        <label>
          <span>企业</span>
          <Select
            value={enterpriseId || undefined}
            placeholder="暂无企业"
            disabled={organizationEnterprises.length === 0}
            onChange={(value) => void handleSwitchEnterprise(value)}
            options={organizationEnterprises.map((enterprise) => ({
              value: enterprise.enterpriseId,
              label: enterprise.name,
            }))}
          />
        </label>
        <label>
          <span>空间</span>
          <Select
            value={currentSpaceId}
            onChange={setCurrentSpace}
            options={spaces.map((space) => ({ value: space.id, label: space.name }))}
          />
        </label>
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <TeamOutlined />
              <span>
                <h2>空间成员</h2>
                <p>{members.length} 位成员</p>
              </span>
            </div>
            {!canManage && currentSpaceType !== 'personal' && <small>仅管理员可邀请成员</small>}
          </div>

          {loadingMembers ? (
            <LoadingState label="正在加载空间成员…" />
          ) : memberError ? (
            <ErrorState message={memberError} onRetry={() => void loadMembers()} />
          ) : members.length === 0 ? (
            <EmptyState description="当前空间暂无成员" />
          ) : (
            <div className={styles.memberList}>
              {members.map((member) => (
                <article key={member.userId} className={styles.memberRow}>
                  <Avatar src={member.avatar}>
                    {(member.nickname || member.email).slice(0, 1)}
                  </Avatar>
                  <div>
                    <b>{member.nickname || member.email.split('@')[0]}</b>
                    <small>{member.email}</small>
                  </div>
                  <Tag>{ROLE_LABELS[member.role]}</Tag>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <ApartmentOutlined />
              <span>
                <h2>团队</h2>
                <p>{teams.length} 个团队</p>
              </span>
            </div>
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={!canManage}
              onClick={() => setCreateTeamOpen(true)}
            >
              创建团队
            </Button>
          </div>

          {loadingTeams ? (
            <LoadingState label="正在加载团队…" />
          ) : teams.length === 0 ? (
            <EmptyState description={enterpriseId ? '当前企业暂无团队' : '选择企业后查看团队'} />
          ) : (
            <div className={styles.teamList}>
              {teams.map((team) => (
                <article key={team._id}>
                  <span>{team.name.slice(0, 1)}</span>
                  <div>
                    <b>{team.name}</b>
                    <small>{team.description || '暂无团队描述'}</small>
                  </div>
                  <SafetyCertificateOutlined />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        title="邀请空间成员"
        open={inviteOpen}
        confirmLoading={inviting}
        okText="邀请"
        cancelText="取消"
        onOk={() => void handleInvite()}
        onCancel={() => setInviteOpen(false)}
      >
        <div className={styles.modalForm}>
          <label>
            <span>成员邮箱</span>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="请输入已注册用户邮箱"
            />
          </label>
          <label>
            <span>空间角色</span>
            <Select
              value={inviteRole}
              onChange={setInviteRole}
              options={(['admin', 'member', 'viewer'] as Role[]).map((role) => ({
                value: role,
                label: ROLE_LABELS[role],
              }))}
            />
          </label>
        </div>
      </Modal>

      <Modal
        title="创建团队"
        open={createTeamOpen}
        confirmLoading={creatingTeam}
        okText="创建"
        cancelText="取消"
        onOk={() => void handleCreateTeam()}
        onCancel={() => setCreateTeamOpen(false)}
      >
        <div className={styles.modalForm}>
          <label>
            <span>团队名称</span>
            <Input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              maxLength={50}
              placeholder="请输入团队名称"
            />
          </label>
          <label>
            <span>团队描述</span>
            <Input.TextArea
              value={teamDescription}
              onChange={(event) => setTeamDescription(event.target.value)}
              maxLength={200}
              rows={3}
              placeholder="描述团队职责或创作范围（选填）"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

export default OrganizationPage
