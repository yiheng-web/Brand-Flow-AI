import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Tag, Empty, Modal, Input, message, Upload } from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UploadOutlined,
  InboxOutlined,
  CloudUploadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/useAuthStore'
import {
  getTaskDetail,
  getTaskTimeline,
  claimTask,
  acceptTask,
  submitTask,
  approveTask,
  rejectTask,
  cancelTask,
  addTimelineEntry,
  STATUS_MAP,
  PRIORITY_MAP,
  ACTION_MAP,
  type TaskData,
  type TimelineEntry,
  type TaskStatus,
} from '@/api/task'
import styles from './tasks.module.css'

const { TextArea } = Input

const TaskDetail = () => {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const userRole = useAuthStore((s) => s.user?.role || 'member')

  const [task, setTask] = useState<TaskData | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [commentText, setCommentText] = useState('')

  // 拒绝审核弹窗
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // 提交作品弹窗
  const [submitModalOpen, setSubmitModalOpen] = useState(false)
  const [submitComment, setSubmitComment] = useState('')
  const [submitFiles, setSubmitFiles] = useState<any[]>([])

  /* ============================
      加载任务详情
   ============================ */
  const loadTask = async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const res = await getTaskDetail(taskId)
      setTask(res)
    } catch {
      // TODO: 后端未实现 GET /tasks/:id 接口
      console.warn('[MOCK] 使用模拟任务数据，后端接口未实现')
      setTask(getMockTask())
    } finally {
      setLoading(false)
    }
  }

  const loadTimeline = async () => {
    if (!taskId) return
    try {
      const res = await getTaskTimeline(taskId)
      if (Array.isArray(res)) {
        setTimeline(res)
      }
    } catch {
      // TODO: 后端未实现 GET /tasks/:id/timeline 接口
      console.warn('[MOCK] 使用模拟时间线数据，后端接口未实现')
      setTimeline(getMockTimeline())
    }
  }

  useEffect(() => {
    loadTask()
    loadTimeline()
  }, [taskId])

  /* ============================
      操作处理
   ============================ */
  const handleClaim = async () => {
    if (!taskId) return
    try {
      await claimTask(taskId)
      message.success('已认领任务')
      loadTask()
      loadTimeline()
    } catch {
      console.warn('[MOCK] 认领任务模拟成功')
      message.success('已认领任务（模拟）')
      setTask((prev) =>
        prev
          ? {
              ...prev,
              status: 'in_progress',
              assigneeId: user?.id || 'me',
              assigneeName: user?.name || '我',
            }
          : null,
      )
    }
  }

  const handleAccept = async () => {
    if (!taskId) return
    try {
      await acceptTask(taskId)
      message.success('已接收任务')
      loadTask()
      loadTimeline()
    } catch {
      console.warn('[MOCK] 接收任务模拟成功')
      message.success('已接收任务（模拟）')
      setTask((prev) => (prev ? { ...prev, status: 'in_progress' } : null))
    }
  }

  const handleSubmit = async () => {
    if (!taskId) return
    try {
      await submitTask(taskId, {
        attachments: submitFiles.map((f) => ({
          id: f.uid,
          name: f.name,
          url: f.url || '',
        })),
        comment: submitComment,
      })
      message.success('作品已提交')
      setSubmitModalOpen(false)
      setSubmitComment('')
      setSubmitFiles([])
      loadTask()
      loadTimeline()
    } catch {
      console.warn('[MOCK] 提交作品模拟成功')
      message.success('作品已提交（模拟）')
      setSubmitModalOpen(false)
      setSubmitComment('')
      setSubmitFiles([])
      setTask((prev) => (prev ? { ...prev, status: 'review' } : null))
      setTimeline((prev) => [
        ...prev,
        {
          id: 't_' + Date.now(),
          taskId: taskId!,
          userId: user?.id || 'me',
          userNickname: user?.name || '我',
          action: 'submitted',
          content: submitComment || '提交了作品',
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }

  const handleApprove = async () => {
    if (!taskId) return
    try {
      await approveTask(taskId)
      message.success('审核通过')
      loadTask()
      loadTimeline()
    } catch {
      console.warn('[MOCK] 审核通过模拟成功')
      message.success('审核通过（模拟）')
      setTask((prev) => (prev ? { ...prev, status: 'completed' } : null))
      setTimeline((prev) => [
        ...prev,
        {
          id: 't_' + Date.now(),
          taskId: taskId!,
          userId: user?.id || 'me',
          userNickname: user?.name || '我',
          action: 'approved',
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }

  const handleReject = async () => {
    if (!taskId || !rejectReason.trim()) {
      message.warning('拒绝必须填写意见')
      return
    }
    try {
      await rejectTask(taskId, { rejectReason })
      message.success('已拒绝')
      setRejectModalOpen(false)
      setRejectReason('')
      loadTask()
      loadTimeline()
    } catch {
      console.warn('[MOCK] 拒绝模拟成功')
      message.success('已拒绝（模拟）')
      setRejectModalOpen(false)
      setRejectReason('')
      setTask((prev) => (prev ? { ...prev, status: 'revision' } : null))
      setTimeline((prev) => [
        ...prev,
        {
          id: 't_' + Date.now(),
          taskId: taskId!,
          userId: user?.id || 'me',
          userNickname: user?.name || '我',
          action: 'rejected',
          content: rejectReason,
          metadata: { rejectReason },
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }

  const handleCancel = async () => {
    if (!taskId) return
    Modal.confirm({
      title: '取消任务',
      content: '确定要取消此任务吗？取消后不可恢复。',
      okText: '确认取消',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await cancelTask(taskId)
          message.success('任务已取消')
          loadTask()
        } catch {
          console.warn('[MOCK] 取消任务模拟成功')
          message.success('任务已取消（模拟）')
          setTask((prev) => (prev ? { ...prev, status: 'cancelled' } : null))
        }
      },
    })
  }

  const handleAddComment = async () => {
    if (!taskId || !commentText.trim()) return
    try {
      await addTimelineEntry(taskId, commentText)
      setCommentText('')
      loadTimeline()
    } catch {
      console.warn('[MOCK] 添加评论模拟成功')
      setCommentText('')
      setTimeline((prev) => [
        ...prev,
        {
          id: 't_' + Date.now(),
          taskId: taskId!,
          userId: user?.id || 'me',
          userNickname: user?.name || '我',
          action: 'commented',
          content: commentText,
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }

  /* ============================
      计算可用操作
   ============================ */
  const availableActions = useMemo(() => {
    if (!task) return []
    const actions: Array<{
      key: string
      label: string
      type?: 'primary' | 'default' | 'danger'
      onClick: () => void
      icon?: React.ReactNode
    }> = []

    // 认领（企业→团队，当前状态为待接收）
    if (task.type === 'enterprise_to_team' && task.status === 'pending' && userRole !== 'member') {
      actions.push({
        key: 'claim',
        label: '认领',
        type: 'primary',
        onClick: handleClaim,
        icon: <InboxOutlined />,
      })
    }

    // 接收（团队→成员，当前状态为待接收）
    if (
      task.type === 'team_to_member' &&
      task.status === 'pending' &&
      task.assigneeId === user?.id
    ) {
      actions.push({
        key: 'accept',
        label: '接收',
        type: 'primary',
        onClick: handleAccept,
        icon: <CheckCircleOutlined />,
      })
    }

    // 提交作品（进行中）
    if (task.status === 'in_progress' && (task.assigneeId === user?.id || userRole !== 'member')) {
      actions.push({
        key: 'submit',
        label: '提交作品',
        type: 'primary',
        onClick: () => setSubmitModalOpen(true),
        icon: <CloudUploadOutlined />,
      })
    }

    // 审核通过/拒绝（待审核，管理员或发布者）
    if (task.status === 'review' && (userRole !== 'member' || task.publisherId === user?.id)) {
      actions.push({
        key: 'approve',
        label: '通过',
        type: 'primary',
        onClick: handleApprove,
        icon: <CheckCircleOutlined />,
      })
      actions.push({
        key: 'reject',
        label: '拒绝',
        type: 'danger',
        onClick: () => setRejectModalOpen(true),
        icon: <CloseCircleOutlined />,
      })
    }

    // 取消（非终态）
    if (!['completed', 'cancelled', 'org_error'].includes(task.status) && userRole !== 'member') {
      actions.push({
        key: 'cancel',
        label: '取消',
        type: 'danger',
        onClick: handleCancel,
        icon: <StopOutlined />,
      })
    }

    return actions
  }, [task, user, userRole])

  /* ============================
      渲染
   ============================ */
  if (loading) {
    return <div className={styles.loadingText}>加载中...</div>
  }

  if (!task) {
    return (
      <div className={styles.detailWrapper}>
        <Empty description="任务不存在" />
      </div>
    )
  }

  const statusInfo = STATUS_MAP[task.status]
  const priorityInfo = PRIORITY_MAP[task.priority]

  return (
    <div className={styles.detailWrapper}>
      {/* 返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/tasks')}
        className={styles.backBtn}
      >
        返回任务列表
      </Button>

      {/* 任务头部 */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitleRow}>
          <h1 className={styles.detailTitle}>{task.title}</h1>
          <Tag color={statusInfo?.color || 'default'}>{statusInfo?.text}</Tag>
        </div>
        <div className={styles.detailMeta}>
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>发布者:</span>
            {task.publisherName}
          </span>
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>接收:</span>
            {task.receiverName}
          </span>
          {task.deadline && (
            <span className={styles.metaItem}>
              <span className={styles.metaLabel}>截止:</span>
              {formatDate(task.deadline)}
            </span>
          )}
          <span className={styles.metaItem}>
            <Tag color={priorityInfo?.color}>{priorityInfo?.text}优先级</Tag>
          </span>
        </div>
      </div>

      {/* 任务内容 */}
      <div className={styles.detailSection}>
        <h3 className={styles.sectionTitle}>任务内容</h3>
        <div className={styles.taskContent}>{task.content}</div>

        {/* 附件 */}
        {task.attachments && task.attachments.length > 0 && (
          <div className={styles.attachmentList}>
            <span className={styles.attachmentLabel}>附件:</span>
            {task.attachments.map((att) => (
              <a
                key={att.id}
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className={styles.attachmentLink}
              >
                {att.name}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* 时间线 */}
      <div className={styles.detailSection}>
        <h3 className={styles.sectionTitle}>时间线</h3>
        {timeline.length === 0 ? (
          <div className={styles.emptyState}>
            <Empty description="暂无记录" />
          </div>
        ) : (
          <div className={styles.timeline}>
            {timeline.map((entry, idx) => (
              <div
                key={entry.id}
                className={`${styles.timelineItem} ${
                  idx === timeline.length - 1 ? styles.timelineItemLast : ''
                }`}
              >
                <div className={styles.timelineDot} />
                <div className={styles.timelineContent}>
                  <div className={styles.timelineHeader}>
                    <span className={styles.timelineUser}>{entry.userNickname}</span>
                    <span className={styles.timelineAction}>{ACTION_MAP[entry.action]}</span>
                    <span className={styles.timelineTime}>{formatDateTime(entry.createdAt)}</span>
                  </div>
                  {entry.content && <div className={styles.timelineBody}>{entry.content}</div>}
                  {entry.metadata?.rejectReason && (
                    <div className={styles.timelineReject}>
                      拒绝意见: {entry.metadata.rejectReason}
                    </div>
                  )}
                  {entry.metadata?.attachments && entry.metadata.attachments.length > 0 && (
                    <div className={styles.timelineAttachments}>
                      {entry.metadata.attachments.map((att) => (
                        <span key={att.id} className={styles.timelineAttachment}>
                          [{att.name}]
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 评论输入 */}
        <div className={styles.commentSection}>
          <TextArea
            placeholder="添加评论..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            maxLength={500}
          />
          <div className={styles.commentActions}>
            <Button type="primary" onClick={handleAddComment} disabled={!commentText.trim()}>
              发送评论
            </Button>
          </div>
        </div>
      </div>

      {/* 操作区 */}
      {availableActions.length > 0 && (
        <div className={styles.actionBar}>
          {availableActions.map((action) => (
            <Button
              key={action.key}
              type={action.type === 'primary' ? 'primary' : undefined}
              danger={action.type === 'danger'}
              icon={action.icon}
              onClick={action.onClick}
              size="large"
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {/* 拒绝审核弹窗 */}
      <Modal
        title="审核拒绝"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleReject}
        okText="确认拒绝"
        okType="danger"
        cancelText="取消"
      >
        <div className={styles.rejectModalBody}>
          <p style={{ color: '#ef4444' }}>拒绝必须填写意见：</p>
          <TextArea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="请填写拒绝原因"
            rows={4}
            maxLength={500}
          />
        </div>
      </Modal>

      {/* 提交作品弹窗 */}
      <Modal
        title="提交作品"
        open={submitModalOpen}
        onCancel={() => setSubmitModalOpen(false)}
        onOk={handleSubmit}
        okText="确认提交"
        cancelText="取消"
      >
        <div className={styles.submitModalBody}>
          <Upload
            multiple
            fileList={submitFiles}
            onChange={({ fileList }) => setSubmitFiles(fileList)}
            beforeUpload={() => false}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
          <TextArea
            placeholder="备注信息（可选）"
            value={submitComment}
            onChange={(e) => setSubmitComment(e.target.value)}
            rows={3}
            maxLength={500}
            style={{ marginTop: 12 }}
          />
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
            只能选择本人共享到创作空间的作品
          </p>
        </div>
      </Modal>
    </div>
  )
}

// ============================
// 工具函数
// ============================

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}

/** Mock 数据 */
function getMockTask(): TaskData {
  return {
    _id: 't1',
    title: '品牌 Logo 设计优化',
    content:
      '需要优化现有品牌 Logo，使其更具现代感，同时保持品牌识别度。请提供 3-5 个方向的设计方案。',
    status: 'in_progress',
    type: 'enterprise_to_team',
    priority: 'high',
    publisherId: 'admin_1',
    publisherName: '张总',
    receiverId: 'team_design',
    receiverName: '设计部',
    receiverType: 'team',
    assigneeId: 'user_3',
    assigneeName: '王五',
    deadline: '2026-08-10',
    attachments: [],
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-02T14:00:00Z',
  }
}

function getMockTimeline(): TimelineEntry[] {
  return [
    {
      id: 'tl1',
      taskId: 't1',
      userId: 'admin_1',
      userNickname: '张总',
      action: 'created',
      content: '任务内容: 需要优化现有品牌 Logo，使其更具现代感',
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'tl2',
      taskId: 't1',
      userId: 'team_admin_1',
      userNickname: '李组长',
      action: 'claimed',
      createdAt: '2026-08-01T11:00:00Z',
    },
    {
      id: 'tl3',
      taskId: 't1',
      userId: 'user_3',
      userNickname: '王五',
      action: 'submitted',
      content: '已完成第一版设计',
      metadata: {
        attachments: [{ id: 'f1', name: 'logo_design_v1.png', url: '#' }],
      },
      createdAt: '2026-08-02T14:00:00Z',
    },
    {
      id: 'tl4',
      taskId: 't1',
      userId: 'admin_1',
      userNickname: '张总',
      action: 'rejected',
      content: '需要修改配色',
      metadata: { rejectReason: '需要修改配色，更偏向蓝色调' },
      createdAt: '2026-08-02T16:00:00Z',
    },
  ]
}

export default TaskDetail
