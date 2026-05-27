import { useEffect, useMemo, useState } from 'react'
import { Button, message } from 'antd'

import type { KnowledgeOverviewDto, KnowledgeScope } from '@brand-flow/common'

import { createKnowledgeBase, getKnowledgeOverview } from '@/api/knowledge'
import { useAppStore } from '@/store/useAppStore'

import { KnowledgeCard } from './components/KnowledgeCard'
import styles from './AssetsPage.module.css'

function buildFallbackOverview(scope: KnowledgeScope): KnowledgeOverviewDto {
  const isTeam = scope === 'team'
  return {
    quota: {
      scope,
      used: 1,
      limit: isTeam ? 20 : 5,
      assetLimitPerBase: isTeam ? 100 : 20,
    },
    bases: [
      {
        id: `${scope}-default`,
        name: isTeam ? '瑞幸项目组 - 核心视觉' : '默认风格库',
        description: isTeam
          ? '包含官方 Logo、品牌蓝、活动模板与团队共用视觉资产。'
          : '包含我常用的色卡、Logo、提示词偏好和参考素材。',
        scope,
        assetCount: isTeam ? 5 : 3,
        assetLimit: isTeam ? 100 : 20,
        color: isTeam ? '#e65100' : '#0b57d0',
        assets: [
          { id: 'blue', type: 'color', label: '品牌蓝', value: '#0b57d0', selected: true },
          { id: 'logo', type: 'logo', label: 'Logo', value: 'brand-logo.svg', selected: true },
          { id: 'copy', type: 'text', label: '文案偏好', value: '清爽、有活力', selected: true },
        ],
      },
    ],
  }
}

export function AssetsPage() {
  const hasTeam = useAppStore((state) => state.hasTeam)
  const currentAssetTab = useAppStore((state) => state.currentAssetTab)
  const setCurrentAssetTab = useAppStore((state) => state.setCurrentAssetTab)
  const [overview, setOverview] = useState<KnowledgeOverviewDto>(() =>
    buildFallbackOverview(currentAssetTab),
  )

  useEffect(() => {
    if (!hasTeam && currentAssetTab === 'team') {
      setCurrentAssetTab('personal')
      return
    }

    let cancelled = false
    void getKnowledgeOverview(currentAssetTab)
      .then((res) => {
        if (!cancelled) setOverview(res.data)
      })
      .catch(() => {
        if (!cancelled) setOverview(buildFallbackOverview(currentAssetTab))
      })

    return () => {
      cancelled = true
    }
  }, [currentAssetTab, hasTeam, setCurrentAssetTab])

  const quotaLabel = useMemo(() => {
    const label = overview.quota.scope === 'team' ? '团队知识库容量' : '私人知识库容量'
    return `${label} ${overview.quota.used} / ${overview.quota.limit}`
  }, [overview])

  const handleCreate = async () => {
    try {
      const res = await createKnowledgeBase(currentAssetTab, '新建知识库')
      setOverview(res.data)
      message.success('知识库已创建')
    } catch {
      message.info('当前使用本地演示数据，真实后端可用后会创建知识库。')
    }
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.tabs}>
          {hasTeam ? (
            <button
              className={`${styles.tab} ${currentAssetTab === 'team' ? styles.tabActive : ''}`}
              type="button"
              onClick={() => setCurrentAssetTab('team')}
            >
              团队知识库
            </button>
          ) : null}
          <button
            className={`${styles.tab} ${currentAssetTab === 'personal' ? styles.tabActive : ''}`}
            type="button"
            onClick={() => setCurrentAssetTab('personal')}
          >
            我的私人知识库
          </button>
        </div>
        <div className={styles.actions}>
          <span className={styles.quotaText}>{quotaLabel}</span>
          <Button type="primary" onClick={() => void handleCreate()}>
            新建知识库
          </Button>
        </div>
      </header>

      <section className={styles.grid}>
        {overview.bases.map((base) => (
          <KnowledgeCard key={base.id} base={base} />
        ))}
      </section>
    </div>
  )
}
