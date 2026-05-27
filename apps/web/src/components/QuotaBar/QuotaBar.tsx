import styles from './QuotaBar.module.css'

interface QuotaBarProps {
  value: number
  max: number
  color?: string
}

export function QuotaBar({ value, max, color }: QuotaBarProps) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0

  return (
    <div className={styles.track}>
      <div className={styles.fill} style={{ width: `${percent}%`, background: color }} />
    </div>
  )
}
