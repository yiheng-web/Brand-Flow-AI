import { useState } from 'react'
import styles from './brand.module.css'

const SIDEBAR_ITEMS = [
  '全部',
  '品牌资料',
  '视觉规范',
  '素材资产',
  '产品信息',
  '参考案例',
  '禁用规则',
  '版式规则',
]

const BrandPage = () => {
  const [activeCategory, setActiveCategory] = useState(SIDEBAR_ITEMS[0])

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        {SIDEBAR_ITEMS.map((item) => {
          const isActive = item === activeCategory
          return (
            <button
              key={item}
              type="button"
              className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
              onClick={() => setActiveCategory(item)}
            >
              {item}
            </button>
          )
        })}
      </aside>

      <main className={styles.main}>
        <h2 className={styles.pageTitle}>{activeCategory}</h2>
        <p className={styles.pagePlaceholder}>此区域内容待配置</p>
      </main>
    </div>
  )
}

export default BrandPage