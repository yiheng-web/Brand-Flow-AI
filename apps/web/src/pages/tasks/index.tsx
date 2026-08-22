import { CheckCircleOutlined, ClockCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import { EmptyState, PageHeader } from '@/design-system/components'
import { useUserStore } from '@/store/useUserStore'

import styles from './tasks.module.css'

const TasksPage = () => {
  const spaceName = useUserStore((state) => state.currentSpaceName)

  return (
    <div className={styles.page}>
      <PageHeader
        title="任务空间"
        description={`集中跟踪创作任务、协作进度与交付状态 · ${spaceName}`}
        actions={
          <Button type="primary" icon={<PlusOutlined />} disabled>
            新建任务
          </Button>
        }
      />

      <div className={styles.summary} aria-label="任务概览">
        <div>
          <ClockCircleOutlined />
          <span>
            <b>进行中</b>
            <small>等待任务服务接入</small>
          </span>
        </div>
        <div>
          <CheckCircleOutlined />
          <span>
            <b>已完成</b>
            <small>暂无可同步数据</small>
          </span>
        </div>
      </div>

      <div className={styles.filters} role="tablist" aria-label="任务筛选">
        <button type="button" role="tab" aria-selected="true">
          全部任务
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          我负责的
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          我参与的
        </button>
      </div>

      <section className={styles.emptyPanel} aria-label="任务列表">
        <EmptyState
          description={
            <span className={styles.emptyDescription}>
              <b>当前版本尚未接入任务数据服务</b>
              <small>页面已按任务空间结构就绪，接入真实接口后将显示当前空间的任务。</small>
            </span>
          }
        />
      </section>
    </div>
  )
}

export default TasksPage
