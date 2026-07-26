import { useEffect, useRef, useState } from 'react'
import type { IntentOutput } from '../../../api/workflow'
import NodePanelFooter from './NodePanelFooter'
import styles from '../workspace.module.css'

interface IntentPanelProps {
  userPrompt: string
  intentResult?: IntentOutput | null
  isRunning?: boolean
  onReRun?: () => void
  onSave?: (payload: Record<string, unknown>) => void
}

const extractIntentKeywords = (intentResult?: IntentOutput | null): string[] =>
  intentResult?.intent ? intentResult.intent.split(/[,，、\s]+/).filter(Boolean) : []

const IntentPanel = ({
  userPrompt,
  intentResult,
  isRunning = false,
  onReRun,
  onSave,
}: IntentPanelProps) => {
  const [keywords, setKeywords] = useState<string[]>(() => extractIntentKeywords(intentResult))
  const [sceneType, setSceneType] = useState(() => intentResult?.intent || '')
  const [isTagInputVisible, setIsTagInputVisible] = useState(false)
  const [editingTagValue, setEditingTagValue] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isTagInputVisible && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isTagInputVisible])

  return (
    <div className={styles.rightContent}>
      <p className={styles.intentDesc}>解析用户创意，提取关键词与场景类型</p>

      <div className={styles.intentPromptSection}>
        <h3 className={styles.rightSectionTitle}>用户原始 Prompt</h3>
        <textarea className={styles.intentPromptInput} value={userPrompt} readOnly rows={3} />
      </div>

      {intentResult ? (
        <div className={styles.intentConfidenceSection}>
          <h3 className={styles.rightSectionTitle}>意图识别</h3>
          <div className={styles.intentConfidenceRow}>
            <span className={styles.intentConfidenceLabel}>意图类型</span>
            <span className={styles.intentConfidenceValue}>{intentResult.intent}</span>
          </div>
          <div className={styles.intentConfidenceRow}>
            <span className={styles.intentConfidenceLabel}>置信度</span>
            <span className={styles.intentConfidenceValue}>
              {Math.round(intentResult.confidence * 100)}%
            </span>
          </div>
          <div className={styles.intentConfidenceRow}>
            <span className={styles.intentConfidenceLabel}>原因</span>
            <span className={styles.intentConfidenceValue}>{intentResult.reason}</span>
          </div>
          {intentResult.suggestedAction && (
            <div className={styles.intentConfidenceRow}>
              <span className={styles.intentConfidenceLabel}>建议操作</span>
              <span className={styles.intentConfidenceValue}>{intentResult.suggestedAction}</span>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.intentEmptySection}>
          {isRunning && <div className={styles.intentEmptySpinner} />}
          <span>{isRunning ? '正在解析当前任务意图...' : '当前任务暂无意图解析结果'}</span>
        </div>
      )}

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
      <NodePanelFooter
        onReRun={async () => {
          if (onSave) {
            await onSave({
              intent: keywords.join(','),
              confidence: intentResult?.confidence || 1,
              reason: intentResult?.reason || '',
              suggestedAction: intentResult?.suggestedAction || '',
            })
          }
          onReRun?.()
        }}
      />
    </div>
  )
}

export default IntentPanel
