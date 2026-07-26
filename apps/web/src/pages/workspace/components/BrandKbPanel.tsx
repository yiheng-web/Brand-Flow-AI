import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '../workspace.module.css'

interface BrandKbPanelProps {
  /** 后端知识库匹配结果（文本内容） */
  knowledgeContext?: string | null
  isRunning?: boolean
  onReRun?: () => void
}

const BrandKbPanel = ({ knowledgeContext, isRunning = false, onReRun }: BrandKbPanelProps) => {
  const navigate = useNavigate()
  const [kbEnabled, setKbEnabled] = useState(true)
  const contextLines = knowledgeContext
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className={styles.rightContent}>
      {/* 灰色说明文字 */}
      <p className={styles.kbHint}>匹配品牌档案中的资料、规范与素材</p>

      {/* 知识库启用开关 */}
      <div className={styles.kbToggleRow}>
        <span className={styles.kbToggleLabel}>知识库：{kbEnabled ? '已启用' : '未启用'}</span>
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
          {knowledgeContext ? (
            <div className={styles.kbCard}>
              <span className={styles.kbCardIcon}>📄</span>
              <div className={styles.kbCardBody}>
                <span className={styles.kbCardTitle}>知识库匹配结果</span>
                <div className={styles.kbContextList}>
                  {contextLines?.map((line) => (
                    <span key={line} className={styles.kbContextLine}>
                      {line}
                    </span>
                  ))}
                </div>
                <span className={styles.kbCardDate}>来自后端实时匹配</span>
              </div>
            </div>
          ) : (
            <div className={styles.kbEmptyState}>
              {isRunning && <div className={styles.kbEmptySpinner} />}
              <span>
                {isRunning ? '正在匹配当前任务的知识库资料...' : '当前任务暂无知识库匹配结果'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 底部按钮 */}
      <div className={styles.kbActions}>
        <button type="button" className={styles.kbActionBtn} onClick={() => navigate('/brand')}>
          🏢 前往品牌档案
        </button>
        <button type="button" className={styles.kbActionBtn} onClick={() => onReRun?.()}>
          🔄 重新运行
        </button>
      </div>
    </div>
  )
}

export default BrandKbPanel
