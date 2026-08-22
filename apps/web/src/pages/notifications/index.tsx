import { BellOutlined, CheckOutlined, InboxOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import { EmptyState, PageHeader } from '@/design-system/components'

import styles from './notifications.module.css'

const NotificationsPage = () => (
  <div className={styles.page}>
    <PageHeader
      title="消息通知"
      description="查看创作进度、协作提醒和系统消息"
      actions={
        <Button icon={<CheckOutlined />} disabled>
          全部标为已读
        </Button>
      }
    />

    <div className={styles.summary}>
      <span className={styles.summaryIcon}>
        <BellOutlined />
      </span>
      <p>
        <b>0 条未读消息</b>
        <small>当前版本尚未接入消息服务</small>
      </p>
    </div>

    <div className={styles.filters} role="tablist" aria-label="消息筛选">
      <button type="button" role="tab" aria-selected="true">
        全部消息
      </button>
      <button type="button" role="tab" aria-selected="false" disabled>
        未读
      </button>
      <button type="button" role="tab" aria-selected="false" disabled>
        系统通知
      </button>
    </div>

    <section className={styles.emptyPanel} aria-label="消息列表">
      <EmptyState
        description={
          <span className={styles.emptyDescription}>
            <InboxOutlined />
            <b>暂无消息</b>
            <small>消息服务接入后，创作进度和协作提醒会显示在这里。</small>
          </span>
        }
      />
    </section>
  </div>
)

export default NotificationsPage
