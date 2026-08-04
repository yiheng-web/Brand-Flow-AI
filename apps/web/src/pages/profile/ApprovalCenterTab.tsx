import { useState, useEffect } from 'react'
import { Button, Tag, Modal, message } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import {
  getApprovalRequests,
  approveRequest,
  rejectRequest,
  type ApprovalRequest,
  type ApprovalType,
} from '@/api/org'
import styles from './profile.module.css'

const APPROVAL_TYPE_MAP: Record<ApprovalType, { text: string; color: string }> = {
  team_leave: { text: '成员退出团队', color: 'orange' },
  team_join_enterprise: { text: '团队加入企业', color: 'blue' },
  enterprise_leave: { text: '成员退出企业', color: 'orange' },
  member_remove: { text: '移除团队成员', color: 'red' },
}

const ApprovalCenterTab = () => {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadRequests = async () => {
      setLoading(true)
      try {
        const res = await getApprovalRequests()
        if (Array.isArray(res)) {
          setRequests(res)
        }
      } catch {
        // TODO: 后端未实现 GET /org/approvals 接口
        console.warn('[MOCK] 使用模拟审批数据，后端接口未实现')
        setRequests([
          {
            id: '1',
            type: 'team_leave',
            applicantName: '李四',
            applicantId: 'user_2',
            reason: '个人原因',
            createdAt: '2026-08-04T10:00:00Z',
            teamId: 't1',
            teamName: '设计部',
          },
          {
            id: '2',
            type: 'team_join_enterprise',
            applicantName: '设计部',
            applicantId: 'team_t1',
            reason: '业务需要',
            createdAt: '2026-08-03T16:00:00Z',
            teamId: 't1',
            teamName: '设计部',
          },
        ])
      } finally {
        setLoading(false)
      }
    }
    loadRequests()
  }, [])

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest(requestId)
      message.success('已通过申请')
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
    } catch {
      message.error('操作失败')
    }
  }

  const handleReject = (requestId: string) => {
    Modal.confirm({
      title: '拒绝申请',
      content: '确定要拒绝此申请吗？',
      okText: '确认拒绝',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await rejectRequest(requestId)
          message.success('已拒绝申请')
          setRequests((prev) => prev.filter((r) => r.id !== requestId))
        } catch {
          message.error('操作失败')
        }
      },
    })
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return <div className={styles.loadingText}>加载中...</div>
  }

  if (requests.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CheckCircleOutlined className={styles.emptyIcon} />
        <p>暂无待审批申请</p>
      </div>
    )
  }

  return (
    <div className={styles.tabContent}>
      <h3 className={styles.sectionTitle}>待审批申请</h3>
      <div className={styles.approvalList}>
        {requests.map((req) => (
          <div key={req.id} className={styles.approvalCard}>
            <div className={styles.approvalHeader}>
              <Tag
                color={APPROVAL_TYPE_MAP[req.type]?.color || 'default'}
                className={styles.approvalTypeTag}
              >
                {APPROVAL_TYPE_MAP[req.type]?.text || req.type}
              </Tag>
              <span className={styles.approvalTime}>{formatDateTime(req.createdAt)}</span>
            </div>

            <div className={styles.approvalBody}>
              {req.type === 'team_join_enterprise' ? (
                <div className={styles.approvalInfoRow}>
                  <span className={styles.approvalInfoLabel}>申请团队：</span>
                  <span>{req.teamName || req.applicantName}</span>
                </div>
              ) : (
                <div className={styles.approvalInfoRow}>
                  <span className={styles.approvalInfoLabel}>申请人：</span>
                  <span>{req.applicantName}</span>
                </div>
              )}
              {req.reason && (
                <div className={styles.approvalInfoRow}>
                  <span className={styles.approvalInfoLabel}>原因：</span>
                  <span>{req.reason}</span>
                </div>
              )}
            </div>

            <div className={styles.approvalActions}>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApprove(req.id)}
              >
                通过
              </Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => handleReject(req.id)}>
                拒绝
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ApprovalCenterTab
