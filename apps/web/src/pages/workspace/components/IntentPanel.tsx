/**
 * 意图节点属性面板
 *
 * 展示用户原始 Prompt、解析关键词、场景类型
 * 支持手动增删关键词、编辑场景类型
 */

import { useEffect, useState, useRef } from 'react'
import { mockExtractKeywords, mockInferSceneType } from './IntentPanel.utils'
import type { IntentOutput } from '../../../api/workflow'
import styles from '../workspace.module.css'

interface IntentPanelProps {
  /** 用户在首页输入的原始 prompt */
  userPrompt: string
  /** 后端意图解析结果（SSE 流式数据） */
  intentResult?: IntentOutput | null
}

const IntentPanel = ({ userPrompt, intentResult }: IntentPanelProps) => {
  const [keywords, setKeywords] = useState<string[]>([])
  const [sceneType, setSceneType] = useState('')
  const [isTagInputVisible, setIsTagInputVisible] = useState(false)
  const [editingTagValue, setEditingTagValue] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  // 当后端数据到达时优先使用，否则 fallback 到前端 mock
  useEffect(() => {
    if (intentResult) {
      setKeywords(
        intentResult.intent
          ? intentResult.intent.split(/[,，、\s]+/).filter(Boolean)
          : []
      )
      setSceneType(intentResult.intent || '')
    } else if (userPrompt) {
      setKeywords(mockExtractKeywords(userPrompt))
      setSceneType(mockInferSceneType(userPrompt))
    }
  }, [userPrompt, intentResult])

  useEffect(() => {
    if (isTagInputVisible && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isTagInputVisible])

  return (
    <div className={styles.rightContent}>
      {/* ===== 说明文字 ===== */}
      <p className={styles.intentDesc}>
        解析用户创意，提取关键词与场景类型
      </p>

      {/* ===== 用户原始 Prompt ===== */}
      <div className={styles.intentPromptSection}>
        <h3 className={styles.rightSectionTitle}>用户原始 Prompt</h3>
        <textarea
          className={styles.intentPromptInput}
          value={userPrompt}
          readOnly
          rows={3}
        />
      </div>

      {/* ===== 后端意图置信度（有后端数据时显示） ===== */}
      {intentResult && (
        <div className={styles.intentConfidenceSection}>
          <h3 className={styles.rightSectionTitle}>意图识别</h3>
          <div className={styles.intentConfidenceRow}>
            <span className={styles.intentConfidenceLabel}>意图类型</span>
            <span className={styles.intentConfidenceValue}>
              {intentResult.intent}
            </span>
          </div>
          <div className={styles.intentConfidenceRow}>
            <span className={styles.intentConfidenceLabel}>置信度</span>
            <span className={styles.intentConfidenceValue}>
              {Math.round(intentResult.confidence * 100)}%
            </span>
          </div>
          <div className={styles.intentConfidenceRow}>
            <span className={styles.intentConfidenceLabel}>原因</span>
            <span className={styles.intentConfidenceValue}>
              {intentResult.reason}
            </span>
          </div>
          {intentResult.suggestedAction && (
            <div className={styles.intentConfidenceRow}>
              <span className={styles.intentConfidenceLabel}>建议操作</span>
              <span className={styles.intentConfidenceValue}>
                {intentResult.suggestedAction}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ===== 解析关键词 ===== */}
      <div className={styles.rightTagSection}>
        <h3 className={styles.rightSectionTitle}>解析关键词</h3>
        <div className={styles.tagList}>
          {keywords.map((tag) => (
            <span key={tag} className={styles.tagChip}>
              <span className={styles.tagChipText}>{tag}</span>
              <button
                type="button"
                className={styles.tagChipRemove}
                onClick={() => {
                  setKeywords((prev) => prev.filter((t) => t !== tag))
                }}
              >
                ×
              </button>
            </span>
          ))}
          {isTagInputVisible ? (
            <input
              ref={tagInputRef}
              className={styles.tagInputInline}
              type="text"
              placeholder="输入标签"
              value={editingTagValue}
              onChange={(e) => setEditingTagValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const trimmed = editingTagValue.trim()
                  if (trimmed && !keywords.includes(trimmed)) {
                    setKeywords((prev) => [...prev, trimmed])
                  }
                  setEditingTagValue('')
                  setIsTagInputVisible(false)
                }
                if (e.key === 'Escape') {
                  setEditingTagValue('')
                  setIsTagInputVisible(false)
                }
              }}
              onBlur={() => {
                setEditingTagValue('')
                setIsTagInputVisible(false)
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className={styles.tagAddDashed}
              onClick={() => {
                setIsTagInputVisible(true)
                setEditingTagValue('')
              }}
            >
              + 添加标签
            </button>
          )}
        </div>
      </div>

      {/* ===== 场景类型 ===== */}
      <div className={styles.intentSceneSection}>
        <h3 className={styles.rightSectionTitle}>场景类型</h3>
        <input
          className={styles.intentSceneInput}
          type="text"
          value={sceneType}
          onChange={(e) => setSceneType(e.target.value)}
          placeholder="点击编辑场景类型"
        />
      </div>

      {/* ===== 重新运行按钮 ===== */}
      <div className={styles.rightFooter}>
        <button
          type="button"
          className={styles.interceptBtn}
          onClick={() => {
            // TODO: 接入后端 /workflow/intent/rerun 接口
            console.log('重新运行意图节点')
          }}
        >
          重新运行该节点
        </button>
      </div>
    </div>
  )
}

export default IntentPanel