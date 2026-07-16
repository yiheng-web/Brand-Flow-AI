import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BankOutlined, FileTextOutlined, RedoOutlined } from '@ant-design/icons'
import styles from '../workspace.module.css'

interface BrandKbPanelProps {
  /** 后端知识库匹配结果（文本内容） */
  knowledgeContext?: string | null
  onReRun?: () => void
}

const BrandKbPanel = ({ knowledgeContext, onReRun }: BrandKbPanelProps) => {
  const navigate = useNavigate()
  const [kbEnabled, setKbEnabled] = useState(true)
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
              <span className={styles.kbCardIcon} aria-hidden="true">
                <FileTextOutlined />
              </span>
              <div className={styles.kbCardBody}>
                <span className={styles.kbCardTitle}>知识库匹配结果</span>
                <span className={styles.kbCardDesc}>{knowledgeContext.slice(0, 120)}</span>
                <span className={styles.kbCardDate}>来自后端实时匹配</span>
              </div>
            </div>
          ) : (
            <div className={styles.kbCard}>
              <div className={styles.kbCardBody}>
                <span className={styles.kbCardTitle}>尚未匹配到品牌知识</span>
                <span className={styles.kbCardDesc}>运行该节点后，匹配结果会显示在这里。</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 底部按钮 */}
      <div className={styles.kbActions}>
        <button type="button" className={styles.kbActionBtn} onClick={() => navigate('/brand')}>
          <BankOutlined /> 前往品牌档案
        </button>
        <button type="button" className={styles.kbActionBtn} onClick={() => onReRun?.()}>
          <RedoOutlined /> 重新运行
        </button>
      </div>
    </div>
  )
}

export default BrandKbPanel
