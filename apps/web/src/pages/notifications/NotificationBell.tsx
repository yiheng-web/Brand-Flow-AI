import { useState, useEffect, useCallback } from 'react'
import { Badge, Dropdown, List, Empty, Button, Tag } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  getUnreadCount,
  getNotifications,
  markNotificationRead,
  TYPE_MAP,
  type NotificationData,
} from '@/api/notification'
import styles from './notifications.module.css'

const NotificationBell = () => {
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [recentNotifs, setRecentNotifs] = useState<NotificationData[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [countRes, listRes] = await Promise.all([
        getUnreadCount(),
        getNotifications({ isRead: false, limit: 5 }),
      ])
      setUnreadCount(typeof countRes === 'number' ? countRes : (countRes?.count ?? 0))
      if (Array.isArray(listRes)) {
        setRecentNotifs(listRes.slice(0, 5))
      }
    } catch {
      console.warn('[MOCK] 使用模拟通知数据')
      const mock = getMockNotifications().filter((n) => !n.isRead)
      setUnreadCount(mock.length)
      setRecentNotifs(mock.slice(0, 5))
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      loadData()
    }
  }

  const handleNotifClick = async (notif: NotificationData) => {
    if (!notif.isRead) {
      markNotificationRead(notif._id).catch(() => {})
      setUnreadCount((c) => Math.max(0, c - 1))
    }

    if (notif.expired) return

    if (notif.actionUrl) {
      navigate(notif.actionUrl)
    } else if (notif.relatedType === 'task' && notif.relatedId) {
      navigate(`/tasks/${notif.relatedId}`)
    } else if (notif.relatedType === 'work' && notif.relatedId) {
      navigate(`/works/${notif.relatedId}`)
    } else if (notif.relatedType === 'approval') {
      navigate('/profile')
    }

    setOpen(false)
  }

  const dropdownContent = (
    <div className={styles.bellDropdown}>
      <div className={styles.bellDropdownHeader}>
        <span>未读通知</span>
        <Button
          type="link"
          size="small"
          onClick={() => {
            navigate('/notifications')
            setOpen(false)
          }}
        >
          查看全部
        </Button>
      </div>
      {recentNotifs.length === 0 ? (
        <div className={styles.bellEmpty}>
          <Empty description="暂无未读消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <List
          dataSource={recentNotifs}
          renderItem={(item) => {
            const typeInfo = TYPE_MAP[item.type]
            return (
              <List.Item className={styles.bellItem} onClick={() => handleNotifClick(item)}>
                <div className={styles.bellItemContent}>
                  <div className={styles.bellItemTitle}>
                    {item.title}
                    <Tag color={typeInfo.color} className={styles.bellItemTag}>
                      {typeInfo.text}
                    </Tag>
                  </div>
                  <div className={styles.bellItemSummary}>{item.summary}</div>
                  <div className={styles.bellItemTime}>{formatTime(item.createdAt)}</div>
                </div>
              </List.Item>
            )
          }}
        />
      )}
    </div>
  )

  return (
    <Dropdown
      open={open}
      onOpenChange={handleOpenChange}
      dropdownRender={() => dropdownContent}
      placement="rightTop"
      trigger={['click']}
      arrow={false}
    >
      <Badge count={unreadCount > 0 ? unreadCount : 0} offset={[-4, 4]}>
        <span className={styles.bellButton}>
          <BellOutlined />
        </span>
      </Badge>
    </Dropdown>
  )
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

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
  ]
}

export default NotificationBell
