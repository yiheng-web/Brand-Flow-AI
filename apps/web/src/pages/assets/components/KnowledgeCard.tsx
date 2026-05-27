import { FolderOpenOutlined } from '@ant-design/icons'

import { QuotaBar } from '@/components/QuotaBar'

import type { KnowledgeCardProps } from '../types'
import styles from './KnowledgeCard.module.css'

export function KnowledgeCard({ base }: KnowledgeCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div className={styles.icon} style={{ background: `${base.color}22`, color: base.color }}>
          <FolderOpenOutlined />
        </div>
        <span className={styles.count}>01</span>
      </div>
      <div>
        <h3 className={styles.title}>{base.name}</h3>
        <p className={styles.description}>{base.description}</p>
      </div>
      <div className={styles.footer}>
        <div className={styles.meta}>
          <span>素材数量</span>
          <span>
            {base.assetCount} / {base.assetLimit}
          </span>
        </div>
        <QuotaBar color={base.color} max={base.assetLimit} value={base.assetCount} />
        <div className={styles.assets}>
          {base.assets.slice(0, 4).map((asset) => (
            <div
              key={asset.id}
              className={styles.assetMini}
              style={
                asset.type === 'color' ? { background: asset.value, color: '#fff' } : undefined
              }
            >
              {asset.type === 'color' ? asset.value : asset.type.toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}
