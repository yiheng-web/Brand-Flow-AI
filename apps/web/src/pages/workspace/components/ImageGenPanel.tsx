/**
 * 图像生成节点属性面板
 *
 * 输入：Node 3 最终确定的专家提示词 + 用户选择的模型
 * 处理：调用底层大模型（Flux/SDXL）绘制高质量底图
 * 输出：生成的底图链接 (Base Image URL) 及生图 Seed、Step 等参数记录
 */

import { useState } from 'react'
import styles from '../workspace.module.css'

/* ---------- 内置模型列表 ---------- */
const BUILTIN_MODELS = [
  { id: 'flux', label: 'Flux' },
  { id: 'sdxl', label: 'SDXL' },
]

const CUSTOM_MODELS: { id: string; label: string }[] = []

const ALL_MODELS = [
  { group: '内置模型', items: BUILTIN_MODELS },
  ...(CUSTOM_MODELS.length > 0
    ? [{ group: '自定义模型', items: CUSTOM_MODELS }]
    : []),
]

interface ImageGenPanelProps {
  /** 选中的模型 ID */
  selectedModel?: string
  /** 切换模型 */
  onModelChange?: (modelId: string) => void
  /** 是否正在生成 */
  isExecuting?: boolean
  /** 生成的底图 URL */
  baseImageUrl?: string | null
  /** 生成参数 */
  genParams?: {
    seed?: number | null
    steps?: number
    cfg?: number
  }
  /** 重新运行该节点 */
  onReRun?: () => void
}

const ImageGenPanel = ({
  selectedModel = 'flux',
  onModelChange,
  isExecuting = false,
  baseImageUrl = null,
  genParams: genParamsProp,
  onReRun,
}: ImageGenPanelProps) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  return (
    <div className={styles.rightContent}>
      {/* ===== 说明文字 ===== */}
      <p className={styles.genDesc}>调用大模型绘制高质量底图</p>

      {/* ===== 模型选择 ===== */}
      <div className={styles.genModelSection}>
        <h3 className={styles.rightSectionTitle}>模型选择</h3>
        <div className={styles.genModelSelectWrap}>
          <select
            className={styles.genModelSelect}
            value={selectedModel}
            onChange={(e) => onModelChange?.(e.target.value)}
          >
            {ALL_MODELS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* ===== 生成参数记录 ===== */}
      <div className={styles.genParamsSection}>
        <h3 className={styles.rightSectionTitle}>生成参数</h3>
        <div className={styles.genParamsGrid}>
          <div className={styles.genParamItem}>
            <span className={styles.genParamLabel}>Seed</span>
            <span className={styles.genParamValue}>
              {genParamsProp?.seed ?? '—'}
            </span>
          </div>
          <div className={styles.genParamItem}>
            <span className={styles.genParamLabel}>Steps</span>
            <span className={styles.genParamValue}>
              {genParamsProp?.steps ?? 30}
            </span>
          </div>
          <div className={styles.genParamItem}>
            <span className={styles.genParamLabel}>CFG</span>
            <span className={styles.genParamValue}>
              {genParamsProp?.cfg ?? 7.5}
            </span>
          </div>
        </div>
      </div>

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
                <div
                  className={styles.imageLightbox}
                  onClick={() => setIsLightboxOpen(false)}
                >
                  <button
                    className={styles.lightboxClose}
                    onClick={() => setIsLightboxOpen(false)}
                  >
                    ×
                  </button>
                  <img
                    src={baseImageUrl}
                    alt="生成底图"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </>
          ) : isExecuting ? (
            <div className={styles.genPreviewLoading}>
              <div className={styles.genSpinner} />
              <span>正在生成...</span>
            </div>
          ) : (
            <div className={styles.genPreviewPlaceholder}>
              等待执行图像生成
            </div>
          )}
        </div>
      </div>

      {/* ===== 底部操作按钮 ===== */}
      <div className={styles.rightFooter}>
        <button
          type="button"
          className={styles.interceptBtn}
          disabled={isExecuting}
          onClick={onReRun}
        >
          重新运行该节点
        </button>
      </div>
    </div>
  )
}

export default ImageGenPanel