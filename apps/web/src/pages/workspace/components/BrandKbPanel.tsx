import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '../workspace.module.css'

interface KbMatchItem {
  id: string
  icon: string
  title: string
  description: string
  updatedAt: string
}

const MOCK_MATCHED_ITEMS: KbMatchItem[] = [
  {
    id: 'kb-1',
    icon: '📄',
    title: '品牌蓝规范文档',
    description: '品牌蓝色的十六进制色值 #0022AB 及使用规范',
    updatedAt: '2024-12-01',
  },
  {
    id: 'kb-2',
    icon: '🖼️',
    title: '标准 Logo（白底）.svg',
    description: 'Luckin Coffee 品牌标识标准版本',
    updatedAt: '2024-11-15',
  },
]

interface BrandKbPanelProps {
  /** 后端知识库匹配结果（文本内容） */
  knowledgeContext?: string | null
  onReRun?: () => void
}

const BrandKbPanel = ({ knowledgeContext, onReRun }: BrandKbPanelProps) => {
  const navigate = useNavigate()
  const [kbEnabled, setKbEnabled] = useState(true)
  const matchedContext = knowledgeContext || ''

  return (
    <div className={styles.rightContent}>
      {/* 灰色说明文字 */}
      <p className={styles.kbHint}>匹配品牌档案中的资料、规范与素材</p>

      {/* 知识库启用开关 */}
      <div className={styles.kbToggleRow}>
        <span className={styles.kbToggleLabel}>
          知识库：{kbEnabled ? '已启用' : '未启用'}
        </span>
        <button
          type="button"
          className={`${styles.kbToggleSwitch} ${kbEnabled ? styles.kbToggleOn : styles.kbToggleOff}`}
          onClick={() => setKbEnabled((v) => !v)}
          aria-label={kbEnabled ? '停用知识库' : '启用知识库'}
        >
          <span className={styles.kbToggleKnob} />
        </button>
      </div>

      {/* 已启用时展示匹配结果卡片 */}
      {kbEnabled && (
        <div className={styles.kbCardList}>
          {/* 有后端数据时直接展示匹配文本 */}
          {knowledgeContext ? (
            <div className={styles.kbCard}>
              <span className={styles.kbCardIcon}>📄</span>
              <div className={styles.kbCardBody}>
                <span className={styles.kbCardTitle}>知识库匹配结果</span>
                <span className={styles.kbCardDesc}>{knowledgeContext.slice(0, 120)}</span>
                <span className={styles.kbCardDate}>来自后端实时匹配</span>
              </div>
            </div>
          ) : (
            MOCK_MATCHED_ITEMS.map((item) => (
            <div key={item.id} className={styles.kbCard}>
              <span className={styles.kbCardIcon}>{item.icon}</span>
              <div className={styles.kbCardBody}>
                <span className={styles.kbCardTitle}>{item.title}</span>
                <span className={styles.kbCardDesc}>{item.description}</span>
                <span className={styles.kbCardDate}>更新时间：{item.updatedAt}</span>
              </div>
            </div>
            ))
          )}
        </div>
      )}

      {/* 底部按钮 */}
      <div className={styles.kbActions}>
        <button
          type="button"
          className={styles.kbActionBtn}
          onClick={() => navigate('/brand')}
        >
          🏢 前往品牌档案
        </button>
        <button
          type="button"
          className={styles.kbActionBtn}
          onClick={() => onReRun?.()}
        >
          🔄 重新运行
        </button>
      </div>
    </div>
  )
}

export default BrandKbPanel