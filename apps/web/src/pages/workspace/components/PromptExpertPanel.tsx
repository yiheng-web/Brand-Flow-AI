/**
 * Prompt 专家节点属性面板
 *
 * 输入：用户原始 Prompt + Node 1 意图关键词 + Node 2 知识库素材
 * 处理：汇总信息 → 构建绘图引擎（SD/Flux）高级指令
 * 输出：正向提示词 (Positive Prompt) + 负向提示词 (Negative Prompt)
 */

import { useEffect, useState } from 'react'
import type { PromptChainOutput } from '../../../api/workflow'
import styles from '../workspace.module.css'

interface PromptExpertPanelProps {
  /** 用户原始 Prompt */
  userPrompt?: string
  /** 后端 PromptChain 输出结果（SSE 流式数据） */
  promptResult?: PromptChainOutput | null
  /** 重新运行该节点 */
  onReRun?: () => void
}

const PromptExpertPanel = ({ userPrompt = '', promptResult, onReRun }: PromptExpertPanelProps) => {
  const [positivePrompt, setPositivePrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')

  // 有后端数据时自动填充
  useEffect(() => {
    if (promptResult) {
      setPositivePrompt(promptResult.finalPrompt || promptResult.systemPrompt || '')
      setNegativePrompt(promptResult.userPrompt || '')
    }
  }, [promptResult])

  return (
    <div className={styles.rightContent}>
      {/* ===== 说明文字 ===== */}
      <p className={styles.promptDesc}>
        综合上游信息生成正负向 Prompt
      </p>

      {/* ===== 目标说明 ===== */}
      <div className={styles.promptGoalRow}>
        <span className={styles.promptGoalTag}>目标</span>
        <span className={styles.promptGoalText}>
          写出给绘图引擎（SD/Flux）看的高级指令
        </span>
      </div>

      {/* ===== 上游信息汇总 ===== */}
      <div className={styles.promptUpstreamSection}>
        <h3 className={styles.rightSectionTitle}>上游信息汇总</h3>
        {promptResult && promptResult.purpose && (
          <div className={styles.promptUpstreamRow}>
            <span className={styles.promptUpstreamLabel}>目的：</span>
            <span className={styles.promptUpstreamValue}>
              {promptResult.purpose}
            </span>
          </div>
        )}
      </div>

      {/* ===== 正向 Prompt ===== */}
      <div className={styles.promptBlockSection}>
        <h3 className={styles.promptBlockTitle}>
          正向 Prompt
          <span className={styles.promptBlockLang}>(Positive Prompt / EN)</span>
        </h3>
        <textarea
          className={styles.promptTextarea}
          value={positivePrompt}
          onChange={(e) => setPositivePrompt(e.target.value)}
          rows={12}
          spellCheck={false}
        />
      </div>

      {/* ===== 负向 Prompt ===== */}
      <div className={styles.promptBlockSection}>
        <h3 className={styles.promptBlockTitle}>
          负向 Prompt
          <span className={styles.promptBlockLang}>(Negative Prompt / EN)</span>
        </h3>
        <textarea
          className={styles.promptTextarea}
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={6}
          spellCheck={false}
        />
      </div>

      {/* ===== 重新运行按钮 ===== */}
      <div className={styles.rightFooter}>
        <button
          type="button"
          className={styles.interceptBtn}
          onClick={onReRun}
        >
          重新运行该节点
        </button>
      </div>
    </div>
  )
}

export default PromptExpertPanel