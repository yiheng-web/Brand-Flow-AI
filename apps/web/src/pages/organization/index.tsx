import { useEffect, useRef, useState } from 'react'
import { Avatar, Button, Input, Modal, Popconfirm, Select, Space, Tag } from 'antd'
import { Link } from 'react-router-dom'
import {
  createEnterprise,
  createTeam,
  updateEnterprise,
  updateTeam,
  deleteTeam,
  getTeams,
  getSpaceMembers,
  inviteSpaceMember,
  changeMemberRole,
  removeMember,
  leaveSpace,
  transferOwner,
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
type Editor =
  | 'createEnterprise'
  | 'editEnterprise'
  | 'createTeam'
  | 'editTeam'
  | 'invite'
  | 'transfer'
const TITLES: Record<Editor, string> = {
  createEnterprise: '创建企业',
  editEnterprise: '编辑企业',
  createTeam: '创建团队',
  editTeam: '编辑团队',
  invite: '邀请成员',
  transfer: '转移所有权',
}

export default function OrganizationPage() {
  const enterprises = useUserStore((state) => state.enterprises)
  const refresh = useUserStore((state) => state.refreshOrganizations)
  const setCurrentSpace = useUserStore((state) => state.setCurrentSpace)
  const userId = useAuthStore((state) => state.user?.id)
  const setToken = useAuthStore((state) => state.setToken)
  const [enterpriseSelection, setEnterpriseSelection] = useState('')
  const enterprise =
    enterprises.find((item) => item.enterpriseId === enterpriseSelection) ?? enterprises[0]
  const enterpriseId = enterprise?.enterpriseId
  const [teamSelection, setTeamSelection] = useState('')
  const [teams, setTeams] = useState<TeamData[]>([])
  const team = teams.find(
    (item) => item._id === teamSelection && item.enterpriseId === enterpriseId,
  )
  const spaceId = team?._id ?? enterpriseId
  const permissions = team?.permissions ?? enterprise?.permissions
  const role = team?.role ?? enterprise?.role
  const [members, setMembers] = useState<SpaceMemberData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [name, setName] = useState('')
  const [logo, setLogo] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('member')
  const [targetId, setTargetId] = useState<string>()
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    refresh().catch((reason: unknown) => {
      if (active) {
        setError(reason instanceof Error ? reason.message : '加载组织失败')
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [refresh, revision])

  useEffect(() => {
    let active = true
    if (!enterpriseId) {
      queueMicrotask(() => {
        if (active) {
          setTeams([])
          setMembers([])
          setLoading(false)
        }
      })
      return () => {
        active = false
      }
    }
    queueMicrotask(() => {
      if (active) {
        setLoading(true)
        setError(null)
      }
    })
    Promise.all([getTeams(enterpriseId), getSpaceMembers(teamSelection || enterpriseId)])
      .then(([nextTeams, nextMembers]) => {
        if (active) {
          setTeams(nextTeams)
          setMembers(nextMembers)
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setTeams([])
          setMembers([])
          setError(reason instanceof Error ? reason.message : '加载组织详情失败')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [enterpriseId, teamSelection, revision])

  const handleAction = async (operation: () => Promise<unknown>, success: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await operation()
      setNotice(success)
      setEditor(null)
      await refresh()
      setRevision((value) => value + 1)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '操作失败，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleOpen = (next: Editor) => {
    setEditor(next)
    setName(
      next === 'editEnterprise'
        ? (enterprise?.name ?? '')
        : next === 'editTeam'
          ? (team?.name ?? '')
          : '',
    )
    setLogo(enterprise?.logo ?? '')
    setDescription(team?.description ?? '')
    setEmail('')
    setInviteRole('member')
    setTargetId(undefined)
    setError(null)
  }

  const handleSave = () => {
    if (!editor || busyRef.current || (editor !== 'createEnterprise' && loading)) return
    if (editor === 'invite') {
      if (!email.trim() || !spaceId) {
        setError('请输入邀请邮箱')
        return
      }
      void handleAction(
        () => inviteSpaceMember(spaceId, { email: email.trim(), role: inviteRole }),
        '邀请已创建；对方注册后可在邀请中心接受，有效期 7 天',
      )
    } else if (editor === 'transfer') {
      if (!targetId || !enterpriseId) {
        setError('请选择企业成员')
        return
      }
      void handleAction(
        () => transferOwner(enterpriseId, targetId),
        '所有权已转移，你的角色已变为管理员',
      )
    } else {
      if (!name.trim()) {
        setError('名称不能为空')
        return
      }
      if (editor === 'createEnterprise')
        void handleAction(
          () => createEnterprise({ name: name.trim(), logo: logo || undefined }),
          '企业创建成功',
        )
      if (editor === 'editEnterprise' && enterpriseId)
        void handleAction(
          () => updateEnterprise(enterpriseId, { name: name.trim(), logo: logo || undefined }),
          '企业资料已保存',
        )
      if (editor === 'createTeam' && enterpriseId)
        void handleAction(
          () => createTeam({ enterpriseId, name: name.trim(), description }),
          '团队创建成功',
        )
      if (editor === 'editTeam' && team)
        void handleAction(
          () => updateTeam(team._id, { name: name.trim(), description }),
          '团队资料已保存',
        )
    }
  }
  const handleEnterSpace = (id: string, parentId: string) =>
    handleAction(async () => {
      const result = await switchEnterprise(parentId)
      setToken(result.access_token)
      setCurrentSpace(id)
    }, '已切换至协作空间')
  const disabled = busy || loading
  const selfMembership = members.find((item) => item.userId === userId)
  const roleOptions = (role === 'owner' ? ['admin', 'member', 'viewer'] : ['member', 'viewer']).map(
    (value) => ({ value, label: ROLE_LABELS[value as Role] }),
  )

  return (
    <div className={styles.page}>
      <PageHeader
        title="我的组织"
        description="管理企业、团队和成员；邀请须由接收者确认"
        actions={
          <Space wrap>
            <Link to="/invitations">邀请中心</Link>
            <Button type="primary" disabled={busy} onClick={() => handleOpen('createEnterprise')}>
              创建企业
            </Button>
          </Space>
        }
      />
      {notice && <p role="status">{notice}</p>}
      {error && <ErrorState message={error} onRetry={() => setRevision((value) => value + 1)} />}
      <div className={styles.selectorGrid}>
        <label htmlFor="organization-enterprise">
          企业
          <Select
            id="organization-enterprise"
            value={enterpriseId}
            placeholder="请选择企业"
            onChange={(id) => {
              setEnterpriseSelection(id)
              setTeamSelection('')
            }}
            options={enterprises.map((item) => ({
              value: item.enterpriseId,
              label: `${item.name}${item.status === 'disabled' ? '（已停用）' : ''}`,
            }))}
          />
        </label>
      </div>
      {!enterprise ? (
        <EmptyState description="尚未加入企业，可以创建企业或前往邀请中心" />
      ) : (
        <>
          <section className={styles.organizationHero}>
            <span className={styles.organizationMark}>{enterprise.name.slice(0, 1)}</span>
            <div>
              <h2>{enterprise.name}</h2>
              <Tag>{ROLE_LABELS[enterprise.role]}</Tag>
              <Tag>{enterprise.status === 'disabled' ? '已停用' : '使用中'}</Tag>
            </div>
            <Space wrap>
              <Button
                disabled={disabled || !enterprise.permissions.read}
                onClick={() =>
                  void handleEnterSpace(enterprise.enterpriseId, enterprise.enterpriseId)
                }
              >
                进入企业空间
              </Button>
              <Button
                disabled={disabled || !enterprise.permissions.manageOrganization}
                onClick={() => handleOpen('editEnterprise')}
              >
                编辑企业
              </Button>
              <Popconfirm
                title={
                  enterprise.status === 'active'
                    ? '停用后组织资源将暂停访问，数据保留，确认停用？'
                    : '恢复企业？'
                }
                onConfirm={() =>
                  handleAction(
                    () =>
                      updateEnterprise(enterprise.enterpriseId, {
                        status: enterprise.status === 'active' ? 'disabled' : 'active',
                      }),
                    '企业状态已更新',
                  )
                }
              >
                <Button disabled={disabled || !enterprise.permissions.manageOrganization}>
                  {enterprise.status === 'active' ? '停用企业' : '恢复企业'}
                </Button>
              </Popconfirm>
              <Button
                disabled={disabled || !enterprise.permissions.transferOwnership}
                onClick={() => {
                  setTeamSelection('')
                  handleOpen('transfer')
                }}
              >
                转移所有权
              </Button>
            </Space>
          </section>
          <div className={styles.contentGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>团队列表</h2>
                </div>
                <Button
                  disabled={disabled || !enterprise.permissions.manageMembers}
                  onClick={() => handleOpen('createTeam')}
                >
                  创建团队
                </Button>
              </div>
              {loading ? (
                <LoadingState label="正在加载团队…" />
              ) : teams.length === 0 ? (
                <EmptyState description="当前企业暂无团队" />
              ) : (
                <div className={styles.teamList}>
                  {teams.map((item) => (
                    <article key={item._id}>
                      <div>
                        <b>{item.name}</b>
                        <small>
                          {item.description || '暂无描述'} ·{' '}
                          {item.status === 'archived' ? '已归档' : '使用中'}
                        </small>
                      </div>
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() => setTeamSelection(item._id)}
                      >
                        管理团队
                      </Button>
                      <Button
                        size="small"
                        disabled={busy || !item.permissions.read}
                        onClick={() => void handleEnterSpace(item._id, item.enterpriseId)}
                      >
                        进入空间
                      </Button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{team?.name ?? enterprise.name} · 成员</h2>
                </div>
                <Space wrap>
                  <Button
                    disabled={disabled || !permissions?.manageMembers}
                    onClick={() => handleOpen('invite')}
                  >
                    邀请成员
                  </Button>
                  {team && (
                    <Button disabled={disabled} onClick={() => setTeamSelection('')}>
                      企业成员
                    </Button>
                  )}
                </Space>
              </div>
              <div className={styles.actions}>
                <Space wrap>
                  {team && (
                    <>
                      <Button
                        disabled={disabled || !permissions?.manageOrganization}
                        onClick={() => handleOpen('editTeam')}
                      >
                        编辑团队
                      </Button>
                      <Popconfirm
                        title={
                          team.status === 'active' ? '归档团队？资源保留，暂停访问。' : '恢复团队？'
                        }
                        onConfirm={() =>
                          handleAction(
                            () =>
                              updateTeam(team._id, {
                                status: team.status === 'active' ? 'archived' : 'active',
                              }),
                            '团队状态已更新',
                          )
                        }
                      >
                        <Button disabled={disabled || !permissions?.manageOrganization}>
                          {team.status === 'active' ? '归档团队' : '恢复团队'}
                        </Button>
                      </Popconfirm>
                      <Popconfirm
                        title="删除采用软归档，保留成员及所有资源，确认？"
                        onConfirm={() =>
                          handleAction(
                            () => deleteTeam(team._id),
                            '团队已软删除，可通过恢复团队重新使用',
                          )
                        }
                      >
                        <Button
                          danger
                          disabled={
                            disabled ||
                            !permissions?.manageOrganization ||
                            team.status === 'archived'
                          }
                        >
                          删除团队
                        </Button>
                      </Popconfirm>
                    </>
                  )}
                  {selfMembership && (
                    <Popconfirm
                      title="确认退出？退出企业将同时退出其团队。"
                      onConfirm={() =>
                        handleAction(async () => {
                          if (spaceId) await leaveSpace(spaceId)
                          setTeamSelection('')
                        }, '已退出空间')
                      }
                    >
                      <Button danger disabled={disabled || selfMembership.role === 'owner'}>
                        退出{team ? '团队' : '企业'}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              </div>
              {loading ? (
                <LoadingState label="正在加载成员…" />
              ) : members.length === 0 ? (
                <EmptyState description="当前空间暂无直接成员" />
              ) : (
                <div className={styles.memberList}>
                  {members.map((member) => {
                    const canChange =
                      permissions?.manageMembers &&
                      member.role !== 'owner' &&
                      (member.role !== 'admin' || role === 'owner')
                    return (
                      <article key={member.userId} className={styles.memberRow}>
                        <Avatar src={member.avatar}>
                          {(member.nickname || member.email).slice(0, 1)}
                        </Avatar>
                        <div>
                          <b>{member.nickname || member.email}</b>
                          <small>{member.email}</small>
                        </div>
                        <Tag>{ROLE_LABELS[member.role]}</Tag>
                        {canChange && (
                          <Space wrap>
                            <Select
                              aria-label={`修改 ${member.email} 的角色`}
                              value={member.role}
                              disabled={disabled}
                              options={roleOptions}
                              onChange={(next: Role) => {
                                if (spaceId)
                                  void handleAction(
                                    () => changeMemberRole(spaceId, member.userId, next),
                                    '成员角色已更新',
                                  )
                              }}
                            />
                            <Popconfirm
                              title={`确认移除 ${member.email}？`}
                              onConfirm={() =>
                                spaceId
                                  ? handleAction(
                                      () => removeMember(spaceId, member.userId),
                                      '成员已移除',
                                    )
                                  : undefined
                              }
                            >
                              <Button danger size="small" disabled={disabled}>
                                移除
                              </Button>
                            </Popconfirm>
                          </Space>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
      <Modal
        title={editor ? TITLES[editor] : ''}
        open={editor !== null}
        confirmLoading={busy}
        okButtonProps={{ disabled: busy || (editor !== 'createEnterprise' && loading) }}
        onOk={handleSave}
        onCancel={() => {
          if (!busy) setEditor(null)
        }}
        okText="确认"
        cancelText="取消"
      >
        {error && <p role="alert">{error}</p>}
        <div className={styles.modalForm}>
          {editor === 'invite' ? (
            <>
              <label htmlFor="invite-email">
                成员邮箱
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="支持尚未注册的邮箱"
                />
              </label>
              <label htmlFor="invite-role">
                角色
                <Select
                  id="invite-role"
                  value={inviteRole}
                  onChange={setInviteRole}
                  options={roleOptions}
                />
              </label>
              <p>邀请在 7 天内有效，对方注册后可在邀请中心接受。</p>
            </>
          ) : editor === 'transfer' ? (
            <>
              <p>此操作会将你的角色降为管理员，新所有者必须是企业成员。</p>
              <Select
                aria-label="新所有者"
                value={targetId}
                onChange={setTargetId}
                options={members
                  .filter((item) => item.userId !== userId)
                  .map((item) => ({ value: item.userId, label: item.email }))}
              />
            </>
          ) : (
            <>
              <label htmlFor="organization-name">
                名称
                <Input
                  id="organization-name"
                  maxLength={50}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {editor === 'createEnterprise' || editor === 'editEnterprise' ? (
                <label htmlFor="organization-logo">
                  Logo URL
                  <Input
                    id="organization-logo"
                    type="url"
                    value={logo}
                    onChange={(event) => setLogo(event.target.value)}
                  />
                </label>
              ) : (
                <label htmlFor="team-description">
                  团队描述
                  <Input.TextArea
                    id="team-description"
                    maxLength={200}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
