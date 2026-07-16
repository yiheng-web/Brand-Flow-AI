import { useEffect, useRef, useState } from 'react'
import { DownOutlined } from '@ant-design/icons'
import styles from '../workspace.module.css'

interface GroupOption {
  key: string
  icon: string
  label: string
}

interface SaveKnowledgeModalProps {
  visible: boolean
  /** 当前标签列表（与右侧面板同一数据源） */
  tags: string[]
  /** 更新标签 */
  onTagsChange: (tags: string[]) => void
  /** 分组选项（与知识资产下拉同一数据源） */
  groupOptions: GroupOption[]
  /** 当前选中的分组（仅用于初始化弹窗内部状态） */
  selectedGroupKey: string
  /** 关闭弹窗 */
  onClose: () => void
  /** 确认保存回调 */
  onSave: (data: { name: string; tags: string[]; groupKey: string }) => void
}

const SaveKnowledgeModal = ({
  visible,
  tags,
  onTagsChange,
  groupOptions,
  selectedGroupKey,
  onClose,
  onSave,
}: SaveKnowledgeModalProps) => {
  const [name, setName] = useState('瑞幸夏日海报_v1')
  const [isGroupOpen, setIsGroupOpen] = useState(false)
  const [isTagInputVisible, setIsTagInputVisible] = useState(false)
  const [tagInputValue, setTagInputValue] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)
  const groupWrapRef = useRef<HTMLDivElement>(null)

  /* 弹窗内独立维护分组选择，不与知识资产面板联动 */
  const [localGroupKey, setLocalGroupKey] = useState(selectedGroupKey)

  /* 弹窗打开时，基于外部传入的 selectedGroupKey 重新初始化内部状态 */
  useEffect(() => {
    if (visible) {
      queueMicrotask(() => setLocalGroupKey(selectedGroupKey))
    }
  }, [visible, selectedGroupKey])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!groupWrapRef.current?.contains(event.target as Node)) {
        setIsGroupOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  if (!visible) return null

  const selectedGroup = groupOptions.find((g) => g.key === localGroupKey) ?? groupOptions[0]

  const handleAddTag = () => {
    const trimmed = tagInputValue.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed])
    }
    setTagInputValue('')
    setIsTagInputVisible(false)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* 标题 */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>存入知识库</h2>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* 左侧 — 缩略图 */}
          <div className={styles.modalThumbnail}>
            <span className={styles.modalThumbPlaceholder}>生成图缩略图</span>
          </div>

          {/* 右侧 — 表单 */}
          <div className={styles.modalForm}>
            {/* 素材名称 */}
            <div className={styles.modalFormField}>
              <label className={styles.modalFormLabel}>素材名称</label>
              <input
                className={styles.modalFormInput}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* AI 自动标签 */}
            <div className={styles.modalFormField}>
              <label className={styles.modalFormLabel}>AI 自动标签</label>
              <div className={styles.modalTagList}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tagChip}>
                    <span className={styles.tagChipText}>{tag}</span>
                    <button
                      type="button"
                      className={styles.tagChipRemove}
                      onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
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
                    value={tagInputValue}
                    onChange={(e) => setTagInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddTag()
                      }
                      if (e.key === 'Escape') {
                        setTagInputValue('')
                        setIsTagInputVisible(false)
                      }
                    }}
                    onBlur={() => {
                      if (tagInputValue.trim()) {
                        handleAddTag()
                      } else {
                        setIsTagInputVisible(false)
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.tagAddDashed}
                    onClick={() => {
                      setIsTagInputVisible(true)
                      setTagInputValue('')
                      setTimeout(() => tagInputRef.current?.focus(), 0)
                    }}
                  >
                    + 添加标签
                  </button>
                )}
              </div>
            </div>

            {/* 保存位置 */}
            <div className={styles.modalFormField}>
              <label className={styles.modalFormLabel}>保存位置</label>
              <div ref={groupWrapRef} className={styles.modalGroupSelectWrap}>
                <button
                  type="button"
                  className={styles.modalGroupSelect}
                  onClick={() => setIsGroupOpen((o) => !o)}
                >
                  <span className={styles.modalGroupSelectContent}>
                    <span className={styles.modalGroupSelectIcon}>{selectedGroup.icon}</span>
                    <span className={styles.modalGroupSelectText}>{selectedGroup.label}</span>
                  </span>
                  <span
                    className={`${styles.modalGroupSelectArrow} ${
                      isGroupOpen ? styles.modalGroupSelectArrowOpen : ''
                    }`}
                  >
                    <DownOutlined />
                  </span>
                </button>
                {isGroupOpen && (
                  <div className={styles.modalGroupMenu}>
                    {groupOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`${styles.modalGroupMenuItem} ${
                          option.key === localGroupKey ? styles.modalGroupMenuItemActive : ''
                        }`}
                        onClick={() => {
                          setLocalGroupKey(option.key)
                          setIsGroupOpen(false)
                        }}
                      >
                        <span className={styles.modalGroupMenuItemIcon}>{option.icon}</span>
                        <span className={styles.modalGroupMenuItemText}>{option.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalCancelBtn} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={styles.modalConfirmBtn}
            onClick={() => {
              onSave({ name: name.trim() || '瑞幸夏日海报_v1', tags, groupKey: localGroupKey })
              onClose()
            }}
          >
            确认存入
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaveKnowledgeModal
