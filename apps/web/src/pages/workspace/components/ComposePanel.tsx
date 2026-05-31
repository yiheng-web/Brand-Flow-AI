/**
 * 排版合成节点属性面板
 *
 * 输入：Node 4 生成的底图 URL + 品牌文案 / Logo
 * 处理：图文分离叠加（底图 + 标题层 + Logo 层 + 装饰层）
 * 输出：最终合并排版后的高清图片链接 + 各图层坐标 JSON
 *
 * 节点操作：
 *   右侧面板展示图层叠加进度状态，
 *   合成完成后通过「跳转到画板预览」按钮切换到 CanvasPreview 查看最终效果。
 */

import styles from '../workspace.module.css'

interface LayerStatus {
  name: string
  icon: string
  done: boolean
}

export interface ComposePanelProps {
  /** 各图层完成状态 */
  layers?: LayerStatus[]
  /** 是否正在合成中 */
  isComposing?: boolean
  /** 合成完成后的最终图片 URL */
  finalImageUrl?: string | null
  /** 图层坐标 JSON（预留，供未来编辑使用） */
  layerDataJson?: Record<string, unknown> | null
  /** 切换到画板预览 */
  onSwitchToPreview?: () => void
  /** 重新运行排版合成节点 */
  onReRun?: () => void
}

const DEFAULT_LAYERS: LayerStatus[] = [
  { name: '底图层', icon: '🖼️', done: true },
  { name: '标题层', icon: '📝', done: false },
  { name: 'Logo 层', icon: '🏷️', done: false },
  { name: '装饰层', icon: '✨', done: false },
]

const ComposePanel = ({
  layers = DEFAULT_LAYERS,
  isComposing = false,
  finalImageUrl = null,
  layerDataJson = null,
  onSwitchToPreview,
  onReRun,
}: ComposePanelProps) => {
  return (
    <div className={styles.rightContent}>
      {/* ===== 说明文字 ===== */}
      <p className={styles.composeDesc}>
        图文分离叠加处理中…
        <br />
        <span className={styles.composeDescSub}>
          底图 + 标题层 + Logo 层 + 装饰层
        </span>
      </p>

      {/* ===== 图层叠加进度 ===== */}
      <div className={styles.composeLayerSection}>
        <h3 className={styles.rightSectionTitle}>图层叠加进度</h3>
        <div className={styles.composeLayerList}>
          {layers.map((layer) => (
            <div
              key={layer.name}
              className={`${styles.composeLayerItem} ${
                layer.done
                  ? styles.composeLayerDone
                  : styles.composeLayerPending
              }`}
            >
              <span className={styles.composeLayerIcon}>{layer.icon}</span>
              <span className={styles.composeLayerName}>{layer.name}</span>
              <span className={styles.composeLayerStatus}>
                {layer.done ? '✅' : isComposing ? '⏳' : '⬜'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 合成状态信息 ===== */}
      <div className={styles.composeStatusSection}>
        {isComposing ? (
          <div className={styles.composeStatusRunning}>
            <div className={styles.composeSpinner} />
            <span>正在执行图文合成…</span>
          </div>
        ) : finalImageUrl ? (
          <div className={styles.composeStatusDone}>
            <span className={styles.composeDoneIcon}>✅</span>
            <span>合成完成</span>
          </div>
        ) : (
          <div className={styles.composeStatusIdle}>等待执行排版合成</div>
        )}
      </div>

      {/* ===== 底部操作按钮 ===== */}
      <div className={styles.rightFooter}>
        {finalImageUrl && (
          <button
            type="button"
            className={styles.composePreviewBtn}
            onClick={onSwitchToPreview}
          >
            🎯 跳转到画板预览
          </button>
        )}
        <button
          type="button"
          className={styles.interceptBtn}
          disabled={isComposing}
          onClick={onReRun}
        >
          重新运行该节点
        </button>
      </div>
    </div>
  )
}

export default ComposePanel