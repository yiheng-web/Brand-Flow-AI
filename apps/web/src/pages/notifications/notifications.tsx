import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button, Tag, Empty, Select, Dropdown, message, Modal } from 'antd'
import {
  CheckOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  TeamOutlined,
  BankOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  TYPE_MAP,
  TYPE_FILTER_OPTIONS,
  type NotificationData,
  type NotificationType,
} from '@/api/notification'
import styles from './notifications.module.css'

type FilterKey = 'all' | 'unread' | 'read'

const typeIconMap: Record<string, React.ReactNode> = {
  team: <TeamOutlined />,
  enterprise: <BankOutlined />,
  task: <FileTextOutlined />,
  review: <CheckCircleOutlined />,
  work: <InfoCircleOutlined />,
  ai: <SafetyCertificateOutlined />,
  lock: <SafetyCertificateOutlined />,
  system: <InfoCircleOutlined />,
}

const Notifications = () => {
  const navigate = useNavigate()

  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [typeFilter, setTypeFilter] = useState<NotificationType | ''>('')

  /* ============================
      加载通知列表
   ============================ */
  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {}
      if (activeFilter === 'unread') params.isRead = false
      if (activeFilter === 'read') params.isRead = true
      if (typeFilter) params.type = typeFilter

      const res = await getNotifications(params as any)
      if (Array.isArray(res)) {
        setNotifications(res)
      }
    } catch {
      console.warn('[MOCK] 使用模拟通知数据，后端接口未实现')
      setNotifications(getMockNotifications())
    } finally {
      setLoading(false)
    }
  }, [activeFilter, typeFilter])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  /* ============================
      统计
   ============================ */
  const counts = useMemo(() => {
    const unread = notifications.filter((n) => !n.isRead).length
    const read = notifications.filter((n) => n.isRead).length
    return { all: notifications.length, unread, read }
  }, [notifications])

  /* ============================
      操作
   ============================ */
  const handleMarkRead = async (e: React.MouseEvent, notif: NotificationData) => {
    e.stopPropagation()
    try {
      await markNotificationRead(notif._id)
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n)),
      )
    } catch {
      console.warn('[MOCK] 标记已读模拟成功')
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n)),
      )
    }
  }

  const handleMarkAllRead = async () => {
    if (counts.unread === 0) {
      message.info('没有未读消息')
      return
    }
    try {
      await markAllNotificationsRead()
      message.success('已全部标为已读')
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch {
      console.warn('[MOCK] 全部标记已读模拟成功')
      message.success('已全部标为已读（模拟）')
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    }
  }

  const handleDelete = async (e: React.MouseEvent, notif: NotificationData) => {
    e.stopPropagation()
    Modal.confirm({
      title: '删除通知',
      content: '删除后不可恢复',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteNotification(notif._id)
          setNotifications((prev) => prev.filter((n) => n._id !== notif._id))
        } catch {
          console.warn('[MOCK] 删除模拟成功')
          setNotifications((prev) => prev.filter((n) => n._id !== notif._id))
        }
      },
    })
  }

  /* ============================
      跳转逻辑
   ============================ */
  const handleNotificationClick = (notif: NotificationData) => {
    // 先标记已读
    if (!notif.isRead) {
      markNotificationRead(notif._id).catch(() => {})
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n)),
      )
    }

    // 资源失效不跳转
    if (notif.expired) {
      message.warning(notif.expiredReason || '关联资源已失效')
      return
    }

    // 根据通知类型和关联资源跳转
    if (notif.actionUrl) {
      navigate(notif.actionUrl)
      return
    }

    if (notif.relatedType === 'task' && notif.relatedId) {
      navigate(`/tasks/${notif.relatedId}`)
    } else if (notif.relatedType === 'work' && notif.relatedId) {
      navigate(`/works/${notif.relatedId}`)
    } else if (notif.relatedType === 'approval') {
      navigate('/profile')
    } else if (notif.relatedType === 'workspace') {
      navigate('/workspace')
    }
  }

  /* ============================
      渲染通知项
   ============================ */
  const renderNotificationItem = (notif: NotificationData) => {
    const typeInfo = TYPE_MAP[notif.type]
    const typeIcon = typeIconMap[typeInfo.icon] || <InfoCircleOutlined />

    return (
      <div
        key={notif._id}
        className={`${styles.notifItem} ${notif.isRead ? '' : styles.notifItemUnread}`}
        onClick={() => handleNotificationClick(notif)}
      >
        {/* 未读圆点 */}
        {!notif.isRead && <span className={styles.unreadDot} />}

        {/* 类型图标 */}
        <div className={`${styles.notifIcon} ${styles[`icon_${typeInfo.color}`]}`}>{typeIcon}</div>

        {/* 内容区 */}
        <div className={styles.notifContent}>
          <div className={styles.notifHeader}>
            <span className={styles.notifTitle}>{notif.title}</span>
            <span className={styles.notifTime}>{formatTime(notif.createdAt)}</span>
          </div>
          <div className={styles.notifSummary}>{notif.summary}</div>
          <div className={styles.notifMeta}>
            {notif.senderName && (
              <span className={styles.notifSender}>
                <span className={styles.metaLabel}>发送人:</span>
                {notif.senderName}
              </span>
            )}
            {notif.orgName && (
              <span className={styles.notifOrg}>
                <span className={styles.metaLabel}>组织:</span>
                {notif.orgName}
              </span>
            )}
            <Tag color={typeInfo.color} className={styles.notifTypeTag}>
              {typeInfo.text}
            </Tag>
          </div>

          {/* 失效标记 */}
          {notif.expired && (
            <div className={styles.expiredWarning}>
              <ExclamationCircleOutlined />
              <span>{notif.expiredReason || '关联资源已失效'}</span>
            </div>
          )}
        </div>

        {/* 操作区 */}
        <div className={styles.notifActions} onClick={(e) => e.stopPropagation()}>
          {notif.expired ? (
            <span className={styles.expiredLabel}>已失效</span>
          ) : (
            <>
              {!notif.isRead && (
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={(e) => handleMarkRead(e, notif)}
                >
                  标为已读
                </Button>
              )}
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      label: '删除',
                      danger: true,
                      onClick: (e) => handleDelete(e as any, notif),
                    },
                  ],
                }}
                trigger={['click']}
              >
                <Button size="small" type="text">
                  ...
                </Button>
              </Dropdown>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* 页面头 */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>消息通知</h1>
        <Button
          icon={<CheckCircleOutlined />}
          onClick={handleMarkAllRead}
          disabled={counts.unread === 0}
        >
          全部标为已读
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className={styles.filterBar}>
        <div className={styles.filterTabs}>
          <button
            className={`${styles.filterTab} ${activeFilter === 'all' ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            全部 <span className={styles.filterCount}>({counts.all})</span>
          </button>
          <button
            className={`${styles.filterTab} ${activeFilter === 'unread' ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter('unread')}
          >
            未读 <span className={styles.filterCount}>({counts.unread})</span>
          </button>
          <button
            className={`${styles.filterTab} ${activeFilter === 'read' ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter('read')}
          >
            已读 <span className={styles.filterCount}>({counts.read})</span>
          </button>
        </div>

        <div className={styles.typeFilter}>
          <span className={styles.typeFilterLabel}>类型筛选:</span>
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={TYPE_FILTER_OPTIONS}
            style={{ width: 160 }}
          />
        </div>
      </div>

      {/* 通知列表 */}
      <div className={styles.notifList}>
        {loading ? (
          <div className={styles.loadingText}>加载中...</div>
        ) : notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <Empty
              description={
                activeFilter === 'all' && !typeFilter ? '暂无消息' : '没有符合条件的消息'
              }
            />
          </div>
        ) : (
          notifications.map(renderNotificationItem)
        )}
      </div>
    </div>
  )
}

// ============================
// 工具函数
// ============================

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Mock 数据 */
function getMockNotifications(): NotificationData[] {
  return [
    {
      _id: 'n1',
      type: 'task_submit',
      title: '张三 提交了任务审核',
      summary: '任务: 品牌海报设计',
      senderId: 'user_1',
      senderName: '张三',
      orgId: 'team_design',
      orgName: '设计部',
      isRead: false,
      relatedType: 'task',
      relatedId: 't1',
      actionUrl: '/tasks/t1',
      createdAt: new Date(Date.now() - 2 * 60000).toISOString(),
    },
    {
      _id: 'n2',
      type: 'system',
      title: '作品「产品图」被管理员删除',
      summary: '原因: 内容不符合规范',
      senderName: '系统',
      isRead: true,
      relatedType: 'work',
      relatedId: 'w_deleted',
      expired: true,
      expiredReason: '关联作品已被删除',
      createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
    },
    {
      _id: 'n3',
      type: 'team_leave',
      title: '李四 申请退出团队',
      summary: '申请人: 李四 原因: 个人原因',
      senderId: 'user_2',
      senderName: '李四',
      orgId: 'team_design',
      orgName: '设计部',
      isRead: false,
      relatedType: 'approval',
      actionUrl: '/profile',
      createdAt: new Date(Date.now() - 60 * 60000).toISOString(),
    },
    {
      _id: 'n4',
      type: 'ai_completed',
      title: 'AI 生成完成',
      summary: '作品「夏日海报」',
      senderName: '系统',
      isRead: true,
      relatedType: 'work',
      relatedId: 'w1',
      actionUrl: '/works/w1',
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      _id: 'n5',
      type: 'team_invite',
      title: '李组长 邀请你加入团队「设计部」',
      summary: '快来一起创作吧！',
      senderId: 'team_admin_1',
      senderName: '李组长',
      orgId: 'team_design',
      orgName: '设计部',
      isRead: false,
      relatedType: 'team',
      relatedId: 'team_design',
      createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
    {
      _id: 'n6',
      type: 'review_result',
      title: '任务「产品 Banner 设计」审核结果',
      summary: '审核结果: 通过',
      senderId: 'admin_1',
      senderName: '张总',
      orgId: 'team_design',
      orgName: '设计部',
      isRead: true,
      relatedType: 'task',
      relatedId: 't3',
      actionUrl: '/tasks/t3',
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    },
  ]
}

export default Notifications
