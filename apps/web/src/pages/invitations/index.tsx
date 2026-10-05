import { useEffect, useRef, useState } from 'react'
import { Button, Space, Tabs, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { InvitationData, InvitationStatus } from '@brand-flow/contracts'
import { getInvitations, respondInvitation } from '@/api/org'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'
import styles from '../organization/organization.module.css'

const STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期',
  cancelled: '已撤销',
}

export default function InvitationsPage() {
  const [direction, setDirection] = useState<'received' | 'sent'>('received')
  const [invitations, setInvitations] = useState<InvitationData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const busy = useRef(false)
  const refresh = useUserStore((state) => state.refreshOrganizations)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) {
        setLoading(true)
        setError(null)
      }
    })
    getInvitations(direction)
      .then((items) => {
        if (active) setInvitations(items)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '加载邀请失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [direction, revision])

  const handleRespond = async (id: string, action: 'accept' | 'reject' | 'cancel') => {
    if (busy.current) return
    busy.current = true
    setBusyId(id)
    setError(null)
    try {
      await respondInvitation(id, action)
      await refresh()
      setRevision((value) => value + 1)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '处理邀请失败，请重试')
    } finally {
      busy.current = false
      setBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="邀请中心"
        description="接受邀请后加入空间；尚未注册的邮箱也可收到邀请"
        actions={<Link to="/organization">我的组织</Link>}
      />
      <Tabs
        activeKey={direction}
        onChange={(key) => setDirection(key === 'sent' ? 'sent' : 'received')}
        items={[
          { key: 'received', label: '收到的邀请' },
          { key: 'sent', label: '发出的邀请' },
        ]}
      />
      {error && <ErrorState message={error} onRetry={() => setRevision((value) => value + 1)} />}
      {loading ? (
        <LoadingState label="正在加载邀请…" />
      ) : invitations.length === 0 ? (
        <EmptyState description="暂无邀请" />
      ) : (
        <section className={styles.panel}>
          <div className={styles.memberList}>
            {invitations.map((invitation) => (
              <article className={styles.memberRow} key={invitation.id}>
                <div>
                  <b>{invitation.spaceName}</b>
                  <small>
                    {invitation.inviteeEmail} · {invitation.targetRole} · 有效期至{' '}
                    {new Date(invitation.expiresAt).toLocaleString()}
                  </small>
                </div>
                <Tag>{STATUS_LABELS[invitation.status]}</Tag>
                <Space wrap>
                  {invitation.canRespond && (
                    <>
                      <Button
                        type="primary"
                        disabled={busyId !== null}
                        loading={busyId === invitation.id}
                        onClick={() => void handleRespond(invitation.id, 'accept')}
                      >
                        接受
                      </Button>
                      <Button
                        disabled={busyId !== null}
                        onClick={() => void handleRespond(invitation.id, 'reject')}
                      >
                        拒绝
                      </Button>
                    </>
                  )}
                  {invitation.canCancel && (
                    <Button
                      disabled={busyId !== null}
                      loading={busyId === invitation.id}
                      onClick={() => void handleRespond(invitation.id, 'cancel')}
                    >
                      撤销
                    </Button>
                  )}
                </Space>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
