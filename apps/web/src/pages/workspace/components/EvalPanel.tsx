/**
 * 自我评估节点属性面板（质检员）
 *
 * 输入：Node 5 最终成片 + 用户原始需求 + 关键词 + 知识库规范
 * 处理：AI 自动对成品进行 10 分制打分，低于 6 分打回重构
 * 输出：质检评估报告 JSON（score, passed, feedback, target_retry_node）
 *
 * 节点操作：
 *   右侧面板展示评分规则 + AI 思考过程（打字机效果）
 *   不及格时弹出重构确认弹窗
 */

import type { EvaluationResult } from '../../../api/workflow'
import styles from '../workspace.module.css'

export interface EvalReport {
  score: number
  passed: boolean
  feedback: string
  targetRetryNode?: string
}

interface EvalPanelProps {
  /** AI 思考过程的文字行（打字机逐行追加） */
  thinkingLines?: string[]
  /** 最终评估报告（为空说明还在思考中） */
  report?: EvalReport | null
  /** 从 SSE 获取的评估结果（后端原始数据） */
  evaluationResult?: EvaluationResult | null
  /** 是否正在评估中 */
  isEvaluating?: boolean
  /** 点击「允许大模型自动重构」 */
  onAllowRetry?: () => void
  /** 点击「手动调整参数」 */
  onManualRetry?: () => void
  /** 重新运行该节点 */
  onReRun?: () => void
}

const SCORING_RULES = [
  '✅ 品牌一致性（Logo、主色调、规范字体）— 满分 3 分',
  '✅ 主题符合度（是否贴合用户原始需求）— 满分 3 分',
  '✅ 图文协调性（排版、留白、可读性）— 满分 2 分',
  '✅ 知识库合规（未偏离品牌规范）— 满分 2 分',
]

const EvalPanel = ({
  thinkingLines = [],
  report = null,
  evaluationResult = null,
  isEvaluating = false,
  onAllowRetry,
  onManualRetry,
  onReRun,
}: EvalPanelProps) => {
  // 优先使用 evaluationResult（后端原始数据），其次 report
  const effectiveReport: EvalReport | null =
    evaluationResult && typeof evaluationResult.overallScore === 'number'
      ? {
          score: evaluationResult.overallScore,
          passed: evaluationResult.overallScore >= 6,
          feedback:
            evaluationResult.suggestions?.join('；') || '',
        }
      : report

  return (
    <div className={styles.rightContent}>
      {/* ===== 评分规则 ===== */}
      <div className={styles.evalRulesSection}>
        <h3 className={styles.rightSectionTitle}>评分规则（满分 10 分）</h3>
        <ul className={styles.evalRuleList}>
          {SCORING_RULES.map((rule, i) => (
            <li key={i} className={styles.evalRuleItem}>
              <span className={styles.evalRuleBullet}>·</span>
              <span className={styles.evalRuleText}>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ===== AI 思考过程（打字机效果） ===== */}
      {(isEvaluating || thinkingLines.length > 0) && (
        <div className={styles.evalThinkingSection}>
          <h3 className={styles.rightSectionTitle}>
            {isEvaluating ? '🤔 AI 正在思考…' : '💡 AI 思考过程'}
          </h3>
          <div className={styles.evalThinkingBox}>
            {thinkingLines.map((line, i) => (
              <p key={i} className={styles.evalThinkingLine}>
                {line}
              </p>
            ))}
            {isEvaluating && (
              <span className={styles.evalThinkingCursor}>|</span>
            )}
          </div>
        </div>
      )}

      {/* ===== 评分结果 ===== */}
      {effectiveReport && (
        <div className={styles.evalResultSection}>
          <div
            className={`${styles.evalResultCard} ${
              effectiveReport.passed
                ? styles.evalResultPassed
                : styles.evalResultFailed
            }`}
          >
            <div className={styles.evalScoreRow}>
              <span className={styles.evalScoreLabel}>总分</span>
              <span className={styles.evalScoreValue}>
                {effectiveReport.score}
                <span className={styles.evalScoreMax}> / 10</span>
              </span>
            </div>
            <div className={styles.evalVerdict}>
              {effectiveReport.passed ? '✅ 合格' : '❌ 不合格'}
            </div>
            <p className={styles.evalFeedback}>
              {effectiveReport.feedback}
            </p>
          </div>
        </div>
      )}

      {/* ===== 底部操作 ===== */}
      {effectiveReport && !effectiveReport.passed && (
        <div className={styles.evalRetryActions}>
          <p className={styles.evalRetryPrompt}>
            该图片不达标（{effectiveReport.score}/10），是否允许大模型自动重构？
          </p>
          <button
            type="button"
            className={styles.evalAllowRetryBtn}
            onClick={onAllowRetry}
          >
            ✅ 允许自动重构
          </button>
          <button
            type="button"
            className={styles.interceptBtn}
            onClick={onManualRetry}
          >
            手动调整参数
          </button>
        </div>
      )}

      <div className={styles.rightFooter}>
        <button
          type="button"
          className={styles.interceptBtn}
          disabled={isEvaluating}
          onClick={onReRun}
        >
          重新运行该节点
        </button>
      </div>
    </div>
  )
}

export default EvalPanel