import { Button } from 'antd'

import type { ComposeLayer, EvaluationReport } from '@brand-flow/common'

import styles from './CanvasPreview.module.css'

interface CanvasPreviewProps {
  layers?: ComposeLayer[]
  evaluationReport?: EvaluationReport
  showEvaluation: boolean
  onApproveRerun: () => void
  onSaveKnowledge: () => void
}

export function CanvasPreview({
  layers,
  evaluationReport,
  showEvaluation,
  onApproveRerun,
  onSaveKnowledge,
}: CanvasPreviewProps) {
  const headline = layers?.find((layer) => layer.type === 'text')?.content ?? 'SUMMER ICE'
  const baseImageUrl = layers?.find((layer) => layer.type === 'image' && layer.url)?.url

  return (
    <div className={styles.wrapper}>
      <div className={styles.stage}>
        <div className={styles.poster}>
          {baseImageUrl ? <img className={styles.baseImage} src={baseImageUrl} alt="" /> : null}
          <div className={styles.headline}>{headline}</div>
          <div className={styles.logo}>BF</div>
        </div>
      </div>

      {showEvaluation && evaluationReport ? (
        <section className={styles.panel}>
          <strong>AI 质检评分：{evaluationReport.score}/10</strong>
          <div className={styles.thinking}>
            {evaluationReport.thinking.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
          <div className={styles.actions}>
            {!evaluationReport.passed ? (
              <Button danger onClick={onApproveRerun}>
                允许 AI 回溯重构
              </Button>
            ) : null}
            <Button type="primary" onClick={onSaveKnowledge}>
              保存到知识库
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
