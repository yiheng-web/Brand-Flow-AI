import { useEffect, useState } from 'react'
import { Button, Input, Tag, message } from 'antd'

import type { TeamDto } from '@brand-flow/common'

import { createTeam, generateInviteCode, getTeam, joinTeam } from '@/api/team'
import { useAppStore } from '@/store/useAppStore'
import { useUserStore } from '@/store/useUserStore'

import styles from './ProfilePage.module.css'

const fallbackTeam: TeamDto = {
  id: 'personal',
  name: '',
  hasTeam: false,
  role: 'personal',
  members: [],
}

export function ProfilePage() {
  const [team, setTeam] = useState<TeamDto>(fallbackTeam)
  const [code, setCode] = useState('')
  const [inviteCode, setInviteCode] = useState<string>()
  const [expiresAt, setExpiresAt] = useState<string>()
  const setHasTeam = useAppStore((state) => state.setHasTeam)
  const setRole = useUserStore((state) => state.setRole)
  const userName = useUserStore((state) => state.name)
  const email = useUserStore((state) => state.email)

  useEffect(() => {
    let cancelled = false
    void getTeam()
      .then((res) => {
        if (!cancelled) {
          setTeam(res.data)
          setHasTeam(res.data.hasTeam)
          setRole(res.data.role)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeam(fallbackTeam)
        }
      })

    return () => {
      cancelled = true
    }
  }, [setHasTeam, setRole])

  const handleCreateTeam = async () => {
    try {
      const res = await createTeam('瑞幸项目大组')
      setTeam(res.data)
      setHasTeam(true)
      setRole(res.data.role)
      message.success('团队已创建')
    } catch {
      const nextTeam: TeamDto = {
        id: 'team-demo',
        name: '瑞幸项目大组',
        hasTeam: true,
        role: 'admin',
        members: [{ id: 'demo-user', name: userName, email, role: 'admin', isSelf: true }],
      }
      setTeam(nextTeam)
      setHasTeam(true)
      setRole('admin')
      message.success('已创建本地演示团队')
    }
  }

  const handleJoinTeam = async () => {
    if (code.trim().length !== 6) {
      message.warning('请输入完整的 6 位团队邀请码')
      return
    }

    try {
      const res = await joinTeam({ code: code.trim().toUpperCase() })
      setTeam(res.data)
      setHasTeam(true)
      setRole(res.data.role)
      message.success('已加入团队')
    } catch {
      const nextTeam: TeamDto = {
        id: 'team-demo',
        name: '瑞幸项目大组',
        hasTeam: true,
        role: 'member',
        members: [{ id: 'demo-user', name: userName, email, role: 'member', isSelf: true }],
      }
      setTeam(nextTeam)
      setHasTeam(true)
      setRole('member')
      message.success('已加入本地演示团队')
    }
  }

  const handleGenerateCode = async () => {
    try {
      const res = await generateInviteCode()
      setInviteCode(res.data.code)
      setExpiresAt(res.data.expiresAt)
    } catch {
      setInviteCode('XY8A9Z')
      setExpiresAt(new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString())
    }
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>账号与团队中心</h1>
      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{userName.charAt(0)}</div>
            <div>
              <h2 className={styles.userName}>{userName}</h2>
              <p className={styles.email}>{email}</p>
            </div>
          </div>
          <hr className={styles.divider} />
          <Button block>修改个人资料</Button>
        </section>

        <section className={styles.card}>
          {!team.hasTeam ? (
            <>
              <h2 className={styles.teamTitle}>我的团队</h2>
              <p className={styles.teamDescription}>
                加入或创建团队后，可以与团队成员共享知识库素材，并解锁更高的团队配额。
              </p>
              <div className={styles.joinRow}>
                <Input
                  maxLength={6}
                  placeholder="输入 6 位邀请码"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                />
                <Button type="primary" onClick={() => void handleJoinTeam()}>
                  加入团队
                </Button>
              </div>
              <div className={styles.separator}>或</div>
              <Button block style={{ marginTop: 24 }} onClick={() => void handleCreateTeam()}>
                免费创建我的团队
              </Button>
            </>
          ) : (
            <>
              <div className={styles.teamTitleRow}>
                <div>
                  <h2 className={styles.teamTitle}>
                    {team.name}{' '}
                    <Tag color={team.role === 'admin' ? 'green' : 'blue'}>{team.role}</Tag>
                  </h2>
                  <p className={styles.teamDescription}>共 {team.members.length} 名成员</p>
                </div>
                {team.role === 'admin' ? (
                  <Button type="primary" onClick={() => void handleGenerateCode()}>
                    生成邀请码
                  </Button>
                ) : null}
              </div>

              {inviteCode ? (
                <div className={styles.inviteBox}>
                  <div>
                    <div>复制以下编码发送给组员：</div>
                    <div className={styles.inviteCode}>{inviteCode}</div>
                  </div>
                  <div>
                    <div>有效期至</div>
                    <strong>{expiresAt}</strong>
                  </div>
                </div>
              ) : null}

              <hr className={styles.divider} />
              <h3>成员列表</h3>
              <div className={styles.memberList}>
                {team.members.map((member) => (
                  <div key={member.id} className={styles.memberItem}>
                    <div className={styles.memberIdentity}>
                      <span className={styles.smallAvatar}>{member.name.charAt(0)}</span>
                      <strong>
                        {member.name}
                        {member.isSelf ? '（我）' : ''}
                      </strong>
                    </div>
                    <span>{member.role === 'admin' ? '管理员' : '成员'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
