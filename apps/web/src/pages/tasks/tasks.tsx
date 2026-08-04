import { useState, useEffect, useMemo } from 'react'
import { Button, Tag, Empty, message, Popconfirm } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  InboxOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import {
  getTasks,
  deleteTask,
  STATUS_MAP,
  PRIORITY_MAP,
  type TaskData,
  type TaskStatus,
} from '@/api/task'
import CreateTaskModal from './CreateTaskModal'
import styles from './tasks.module.css'

type FilterKey = 'all' | TaskStatus

const FILTER_TABS: Array<{ key: FilterKey; label: string; icon?: React.ReactNode }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待接收', icon: <InboxOutlined /> },
  { key: 'in_progress', label: '进行中', icon: <SyncOutlined spin /> },
  { key: 'review', label: '待审核', icon: <ClockCircleOutlined /> },
  { key: 'completed', label: '已完成', icon: <CheckCircleOutlined /> },
]

const STATUS_ICON_MAP: Record<TaskStatus, React.ReactNode> = {
  draft: <EditOutlined />,
  pending: <InboxOutlined />,
  in_progress: <SyncOutlined spin />,
  review: <ClockCircleOutlined />,
  revision: <ExclamationCircleOutlined />,
  completed: <CheckCircleOutlined />,
  cancelled: <DeleteOutlined />,
  org_error: <ExclamationCircleOutlined />,
}

const Tasks = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const userRole = useAuthStore((s) => s.user?.role || 'member')

  const [tasks, setTasks] = useState<TaskData[]>([])
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const isAdmin = userRole === 'admin' || userRole === 'owner'

  /* ============================
      加载任务列表
   ============================ */
  const loadTasks = async () => {
    setLoading(true)
    try {
      const res = await getTasks()
      if (Array.isArray(res)) {
        setTasks(res)
      }
    } catch {
      // TODO: 后端未实现 GET /tasks 接口
      console.warn('[MOCK] 使用模拟任务数据，后端接口未实现')
      setTasks(getMockTasks())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [])

  /* ============================
      筛选任务
   ============================ */
  const filteredTasks = useMemo(() => {
    if (activeFilter === 'all') return tasks
    return tasks.filter((t) => t.status === activeFilter)
  }, [tasks, activeFilter])

  /* ============================
      统计各状态任务数
   ============================ */
  const taskCounts = useMemo(() => {
    const counts: Partial<Record<FilterKey, number>> = { all: tasks.length }
    for (const tab of FILTER_TABS) {
      if (tab.key !== 'all') {
        counts[tab.key] = tasks.filter((t) => t.status === tab.key).length
      }
    }
    return counts
  }, [tasks])

  /* ============================
      删除任务
   ============================ */
  const handleDeleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    try {
      await deleteTask(taskId)
      message.success('任务已删除')
      setTasks((prev) => prev.filter((t) => t._id !== taskId))
    } catch {
      // TODO: 后端未实现 DELETE /tasks/:id 接口
      console.warn('[MOCK] 删除任务模拟成功，后端接口未实现')
      setTasks((prev) => prev.filter((t) => t._id !== taskId))
      message.success('任务已删除（模拟）')
    }
  }

  /* ============================
      跳转到任务详情
   ============================ */
  const handleTaskClick = (taskId: string) => {
    navigate(`/tasks/${taskId}`)
  }

  /* ============================
      新建任务成功回调
   ============================ */
  const handleTaskCreated = () => {
    setCreateModalOpen(false)
    loadTasks()
  }

  /* ============================
      渲染任务卡片
   ============================ */
  const renderTaskCard = (task: TaskData) => {
    const statusInfo = STATUS_MAP[task.status]
    const priorityInfo = PRIORITY_MAP[task.priority]

    return (
      <div key={task._id} className={styles.taskCard} onClick={() => handleTaskClick(task._id)}>
        <div className={styles.taskCardHeader}>
          <span className={styles.taskTitle}>{task.title}</span>
          <div className={styles.taskMetaRight}>
            <Tag color={statusInfo?.color || 'default'}>
              {statusInfo?.icon && (
                <span className={styles.tagIcon}>{STATUS_ICON_MAP[task.status]}</span>
              )}
              {statusInfo?.text}
            </Tag>
            <span className={styles.taskDate}>{formatDate(task.updatedAt)}</span>
          </div>
        </div>

        <div className={styles.taskCardBody}>
          <div className={styles.taskInfoRow}>
            <span className={styles.taskInfoLabel}>发布者:</span>
            <span className={styles.taskInfoValue}>{task.publisherName}</span>
          </div>
          <div className={styles.taskInfoRow}>
            <span className={styles.taskInfoLabel}>接收:</span>
            <span className={styles.taskInfoValue}>{task.receiverName}</span>
            {task.assigneeName && (
              <>
                <span className={styles.taskInfoSep}>·</span>
                <span className={styles.taskInfoLabel}>认领:</span>
                <span className={styles.taskInfoValue}>{task.assigneeName}</span>
              </>
            )}
          </div>
          <div className={styles.taskInfoRow}>
            <span className={styles.taskInfoLabel}>优先级:</span>
            <Tag color={priorityInfo?.color}>{priorityInfo?.text}</Tag>
          </div>
        </div>

        {/* 管理员操作 */}
        {isAdmin && (
          <div className={styles.taskCardActions} onClick={(e) => e.stopPropagation()}>
            <Popconfirm
              title="确认删除任务"
              content="删除后无法恢复"
              okText="删除"
              okType="danger"
              onConfirm={(e) => handleDeleteTask(e as any, task._id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* 页面头 */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>任务空间</h1>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            新建任务
          </Button>
        )}
      </div>

      {/* 状态筛选 Tab */}
      <div className={styles.filterTabs}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.filterTab} ${
              activeFilter === tab.key ? styles.filterTabActive : ''
            }`}
            onClick={() => setActiveFilter(tab.key)}
          >
            {tab.icon && <span className={styles.filterTabIcon}>{tab.icon}</span>}
            <span>{tab.label}</span>
            <span className={styles.filterTabCount}>({taskCounts[tab.key] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* 任务列表 */}
      <div className={styles.taskList}>
        {loading ? (
          <div className={styles.loadingText}>加载中...</div>
        ) : filteredTasks.length === 0 ? (
          <div className={styles.emptyState}>
            <Empty
              description={
                activeFilter === 'all'
                  ? '暂无任务'
                  : `没有「${FILTER_TABS.find((t) => t.key === activeFilter)?.label}」状态的任务`
              }
            />
          </div>
        ) : (
          filteredTasks.map(renderTaskCard)
        )}
      </div>

      {/* 新建任务弹窗 */}
      <CreateTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleTaskCreated}
      />
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

/** Mock 数据：后端未实现时使用 */
function getMockTasks(): TaskData[] {
  return [
    {
      _id: 't1',
      title: '品牌 Logo 设计优化',
      content: '需要优化现有品牌 Logo，使其更具现代感',
      status: 'pending',
      type: 'enterprise_to_team',
      priority: 'high',
      publisherId: 'admin_1',
      publisherName: '张总',
      receiverId: 'team_design',
      receiverName: '设计部',
      receiverType: 'team',
      deadline: '2026-08-10',
      attachments: [],
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    },
    {
      _id: 't2',
      title: '产品详情页 UI 改版',
      content: '根据新品牌规范重新设计产品详情页',
      status: 'in_progress',
      type: 'team_to_member',
      priority: 'medium',
      publisherId: 'team_admin_1',
      publisherName: '李组长',
      receiverId: 'user_3',
      receiverName: '王五',
      receiverType: 'member',
      assigneeId: 'user_3',
      assigneeName: '王五',
      deadline: '2026-08-15',
      attachments: [],
      createdAt: '2026-07-30T14:00:00Z',
      updatedAt: '2026-08-02T14:00:00Z',
    },
    {
      _id: 't3',
      title: '营销活动 Banner 设计',
      content: '为 8 月促销活动设计主视觉 Banner',
      status: 'review',
      type: 'team_to_member',
      priority: 'urgent',
      publisherId: 'team_admin_1',
      publisherName: '李组长',
      receiverId: 'user_4',
      receiverName: '赵六',
      receiverType: 'member',
      assigneeId: 'user_4',
      assigneeName: '赵六',
      deadline: '2026-08-05',
      attachments: [],
      createdAt: '2026-07-25T09:00:00Z',
      updatedAt: '2026-08-03T16:00:00Z',
    },
    {
      _id: 't4',
      title: '年度品牌手册更新',
      content: '根据最新品牌规范更新年度品牌手册',
      status: 'completed',
      type: 'enterprise_to_team',
      priority: 'medium',
      publisherId: 'admin_1',
      publisherName: '张总',
      receiverId: 'team_design',
      receiverName: '设计部',
      receiverType: 'team',
      assigneeId: 'team_admin_1',
      assigneeName: '李组长',
      deadline: '2026-07-31',
      attachments: [],
      createdAt: '2026-07-01T10:00:00Z',
      updatedAt: '2026-07-28T18:00:00Z',
      completedAt: '2026-07-28T18:00:00Z',
    },
    {
      _id: 't5',
      title: '社交媒体素材包制作',
      content: '为 Q3 社交媒体渠道准备素材包',
      status: 'revision',
      type: 'team_to_member',
      priority: 'low',
      publisherId: 'team_admin_1',
      publisherName: '李组长',
      receiverId: 'user_2',
      receiverName: '李四',
      receiverType: 'member',
      assigneeId: 'user_2',
      assigneeName: '李四',
      deadline: '2026-08-20',
      attachments: [],
      createdAt: '2026-07-28T11:00:00Z',
      updatedAt: '2026-08-03T17:00:00Z',
    },
  ]
}

export default Tasks
