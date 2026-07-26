/**
 * Prompt 专家节点属性面板
 *
 * 输入：用户原始 Prompt + Node 1 意图关键词 + Node 2 知识库素材
 * 处理：汇总信息 → 构建绘图引擎（SD/Flux）高级指令
 * 输出：正向提示词 (Positive Prompt) + 负向提示词 (Negative Prompt)
 */

import { useState } from 'react'
import type { PromptChainOutput } from '../../../api/workflow'
import NodePanelFooter from './NodePanelFooter'
import styles from '../workspace.module.css'

interface PromptExpertPanelProps {
  /** 用户原始 Prompt */
  userPrompt?: string
  /** 后端 PromptChain 输出结果（SSE 流式数据） */
  promptResult?: PromptChainOutput | null
  /** 重新运行该节点 */
  onReRun?: () => void
  /** 保存修改的数据 */
  onSave?: (payload: Record<string, unknown>) => void
}

const PromptExpertPanel = ({ promptResult, onReRun, onSave }: PromptExpertPanelProps) => {
  const [systemPrompt, setSystemPrompt] = useState(() => promptResult?.systemPrompt || '')
  const [summaryPrompt, setSummaryPrompt] = useState(() => promptResult?.userPrompt || '')
  const [positivePrompt, setPositivePrompt] = useState(() => promptResult?.finalPrompt || '')
  const [negativePrompt, setNegativePrompt] = useState(() => promptResult?.negativePrompt || '')
  const [purpose, setPurpose] = useState(() => promptResult?.purpose || '')

  return (
    <div className={styles.rightContent}>
      {/* ===== 说明文字 ===== */}
      <p className={styles.promptDesc}>综合上游信息生成正负向 Prompt</p>

      {/* ===== 任务目标 ===== */}
      <div className={styles.promptUpstreamSection}>
        <h3 className={styles.rightSectionTitle}>任务目标</h3>
        <textarea
          className={styles.promptTextareaCompact}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={3}
          placeholder="等待后端返回任务目标"
        />
      </div>

      {/* ===== 需求汇总 ===== */}
      <div className={styles.promptBlockSection}>
        <h3 className={styles.promptBlockTitle}>需求汇总</h3>
        <textarea
          className={styles.promptTextarea}
          value={summaryPrompt}
          onChange={(e) => setSummaryPrompt(e.target.value)}
          rows={7}
          placeholder="等待后端返回汇总后的中文需求"
        />
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
          placeholder="等待后端返回最终正向 Prompt"
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
          placeholder="等待后端返回负向 Prompt"
          spellCheck={false}
        />
      </div>

      {/* ===== 系统角色 ===== */}
      <div className={styles.promptBlockSection}>
        <h3 className={styles.promptBlockTitle}>系统提示词</h3>
        <textarea
          className={styles.promptTextareaCompact}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          placeholder="等待后端返回系统角色设定"
          spellCheck={false}
        />
      </div>

      {/* ===== 重新运行按钮 ===== */}
      <NodePanelFooter
        onReRun={async () => {
          if (onSave) {
            await onSave({
              systemPrompt,
              userPrompt: summaryPrompt,
              finalPrompt: positivePrompt,
              negativePrompt,
              purpose,
            })
          }
          onReRun?.()
        }}
      />
    </div>
  )
}

export default PromptExpertPanel
