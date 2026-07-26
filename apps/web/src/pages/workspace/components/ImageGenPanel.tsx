/**
 * 图像生成节点属性面板
 *
 * 展示图像生成节点的底图预览与重新运行操作。
 */

import { useState } from 'react'
import NodePanelFooter from './NodePanelFooter'
import styles from '../workspace.module.css'

interface ImageGenPanelProps {
  /** 是否正在生成 */
  isExecuting?: boolean
  /** 生成的底图 URL */
  baseImageUrl?: string | null
  /** 重新运行该节点 */
  onReRun?: () => void
}

const ImageGenPanel = ({
  isExecuting = false,
  baseImageUrl = null,
  onReRun,
}: ImageGenPanelProps) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  return (
    <div className={styles.rightContent}>
      {/* ===== 说明文字 ===== */}
      <p className={styles.genDesc}>调用大模型绘制高质量底图</p>

      {/* ===== 生成结果预览 ===== */}
      <div className={styles.genPreviewSection}>
        <h3 className={styles.rightSectionTitle}>底图预览</h3>
        <div className={styles.genPreviewBox}>
          {baseImageUrl ? (
            <>
              <img
                className={styles.genPreviewImage}
                src={baseImageUrl}
                alt="生成底图"
                onClick={() => setIsLightboxOpen(true)}
              />
              {isLightboxOpen && (
                <div className={styles.imageLightbox} onClick={() => setIsLightboxOpen(false)}>
                  <button className={styles.lightboxClose} onClick={() => setIsLightboxOpen(false)}>
                    ×
                  </button>
                  <img src={baseImageUrl} alt="生成底图" onClick={(e) => e.stopPropagation()} />
                </div>
              )}
            </>
          ) : isExecuting ? (
            <div className={styles.genPreviewLoading}>
              <div className={styles.genSpinner} />
              <span>正在生成...</span>
            </div>
          ) : (
            <div className={styles.genPreviewPlaceholder}>等待执行图像生成</div>
          )}
        </div>
      </div>

      {/* ===== 底部操作按钮 ===== */}
      <NodePanelFooter rerunDisabled={isExecuting} onReRun={onReRun} />
    </div>
  )
}

export default ImageGenPanel
