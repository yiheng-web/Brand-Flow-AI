import { useState } from 'react'
import { PageHeader } from '@/design-system/components'
import styles from './brand.module.css'
import AssetsPanel from './components/AssetsPanel'

export type AssetFilter = 'all' | 'image' | 'document' | 'video' | 'other'

const SIDEBAR_ITEMS: Array<{ key: AssetFilter; label: string }> = [
  { key: 'all', label: '全部内容' },
  { key: 'image', label: '图片' },
  { key: 'document', label: '文档' },
  { key: 'video', label: '视频' },
  { key: 'other', label: '其他' },
]

const BrandPage = () => {
  const [activeCategory, setActiveCategory] = useState<AssetFilter>('all')

  return (
    <div className={styles.wrapper}>
      <PageHeader
        title="品牌资产"
        description="汇总查看当前空间的品牌资料、图片、视频与其他创作素材"
      />
      <div className={styles.assetLayout}>
        <aside className={styles.sidebar}>
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = item.key === activeCategory
            return (
              <button
                key={item.key}
                type="button"
                className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                onClick={() => setActiveCategory(item.key)}
              >
                {item.label}
              </button>
            )
          })}
        </aside>

        <main className={styles.main}>
          <AssetsPanel filter={activeCategory} />
        </main>
      </div>
    </div>
  )
}

export default BrandPage
