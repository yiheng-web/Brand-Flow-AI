import { useEffect, useState } from 'react'
import { PlusOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Checkbox, Input, Popover, Tag, message } from 'antd'
import { useNavigate } from 'react-router-dom'

import { getKnowledgeList, type KnowledgeData } from '@/api/knowledge'
import { submitPrompt } from '@/api/workflow'
import { getWorks, type WorkData } from '@/api/works'
import { EmptyState, PageHeader } from '@/design-system/components'
import { useAuthStore } from '@/store/useAuthStore'
import { useUserStore } from '@/store/useUserStore'
import { useWorkflowStore } from '@/store/useWorkflowStore'

import styles from './home.module.css'

const Home = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const currentSpaceId = useUserStore((state) => state.currentSpaceId)
  const currentSpaceName = useUserStore((state) => state.currentSpaceName)
  const currentSpaceType = useUserStore((state) => state.currentSpaceType)
  const setWorkflowId = useWorkflowStore((state) => state.setWorkflowId)
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeData[]>([])
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([])
  const [knowledgePickerOpen, setKnowledgePickerOpen] = useState(false)
  const [recentWorks, setRecentWorks] = useState<WorkData[]>([])

  useEffect(() => {
    let active = true
    const spaceId = currentSpaceId || 'personal'
    queueMicrotask(() => {
      if (!active) return
      setKnowledgeLoading(true)
      setSelectedKnowledgeBaseIds([])
    })
    Promise.allSettled([getKnowledgeList(spaceId), getWorks(spaceId)])
      .then(([knowledgeResult, worksResult]) => {
        if (!active) return
        setKnowledgeBases(knowledgeResult.status === 'fulfilled' ? knowledgeResult.value : [])
        setRecentWorks(worksResult.status === 'fulfilled' ? worksResult.value.slice(0, 4) : [])
      })
      .finally(() => {
        if (active) setKnowledgeLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentSpaceId])

  const handleSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      message.warning('请先描述你想创作的图片')
      return
    }

    setSubmitting(true)
    try {
      const workflowData = await submitPrompt({
        prompt: trimmed,
        spaceId: currentSpaceId || 'personal',
        spaceType: currentSpaceType,
        selectedKnowledgeBaseIds,
      })
      if (workflowData?.id) setWorkflowId(workflowData.id)
      message.success('创作已创建，请在工作台运行工作流')
      setPrompt('')
      navigate('/workspace', {
        state: {
          prompt: trimmed,
          workflowId: workflowData?.id,
          selectedKnowledgeBaseIds,
        },
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  const handleToggleKnowledge = (knowledgeBaseId: string) => {
    setSelectedKnowledgeBaseIds((selectedIds) => {
      if (selectedIds.includes(knowledgeBaseId)) {
        return selectedIds.filter((id) => id !== knowledgeBaseId)
      }
      if (selectedIds.length >= 3) {
        message.info('本次创作最多选择 3 个知识库')
        return selectedIds
      }
      return [...selectedIds, knowledgeBaseId]
    })
  }

  const selectedKnowledgeBases = knowledgeBases.filter((item) =>
    selectedKnowledgeBaseIds.includes(item._id || item.id || ''),
  )

  const knowledgePicker = (
    <div className={styles.knowledgePicker}>
      <div className={styles.pickerHeading}>
        <strong>选择知识库</strong>
        <span>{currentSpaceName}可用</span>
      </div>
      <div className={styles.knowledgeOptions}>
        {knowledgeLoading ? (
          <p className={styles.pickerHint}>正在加载知识库…</p>
        ) : knowledgeBases.length === 0 ? (
          <p className={styles.pickerHint}>当前空间暂无可用知识库</p>
        ) : (
          knowledgeBases.map((item) => {
            const knowledgeBaseId = item._id || item.id || ''
            const checked = selectedKnowledgeBaseIds.includes(knowledgeBaseId)
            const disabled = !checked && selectedKnowledgeBaseIds.length >= 3
            const typeLabel =
              item.spaceType === 'enterprise'
                ? '企业知识库'
                : item.spaceType === 'team'
                  ? '团队知识库'
                  : '个人知识库'
            return (
              <button
                key={knowledgeBaseId}
                type="button"
                className={styles.knowledgeOption}
                disabled={disabled}
                aria-pressed={checked}
                onClick={() => handleToggleKnowledge(knowledgeBaseId)}
              >
                <Checkbox checked={checked} disabled={disabled} tabIndex={-1} />
                <span>
                  <b>{item.name}</b>
                  <small>{typeLabel}</small>
                </span>
              </button>
            )
          })
        )}
      </div>
      {selectedKnowledgeBaseIds.length >= 3 && (
        <p className={styles.limitHint}>已达到 3 个知识库上限</p>
      )}
      <Button type="primary" block onClick={() => setKnowledgePickerOpen(false)}>
        完成
      </Button>
    </div>
  )

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={`下午好，${user?.name || '创作者'}`}
        title="今天想创作什么？"
        description="从一个想法开始，让 AI 和品牌知识帮你完成它。"
        actions={
          <span className={styles.statusPill}>
            <i />
            {currentSpaceName} · 规则已同步
          </span>
        }
      />

      <section className={styles.creationCard} aria-label="创建工作流">
        <Input.TextArea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想要的图片，例如：为春季新品设计一张清新的社交媒体海报…"
          className={styles.promptInput}
          autoSize={{ minRows: 3, maxRows: 7 }}
          disabled={submitting}
        />

        {selectedKnowledgeBases.length > 0 && (
          <div className={styles.selectedKnowledge} aria-label="已选择的知识库">
            {selectedKnowledgeBases.map((item) => {
              const knowledgeBaseId = item._id || item.id || ''
              return (
                <Tag
                  key={knowledgeBaseId}
                  closable={!submitting}
                  onClose={() => handleToggleKnowledge(knowledgeBaseId)}
                >
                  {item.name}
                </Tag>
              )
            })}
          </div>
        )}

        <div className={styles.creationToolbar}>
          <Popover
            content={knowledgePicker}
            trigger="click"
            placement="bottomLeft"
            open={knowledgePickerOpen}
            onOpenChange={setKnowledgePickerOpen}
          >
            <button
              type="button"
              className={styles.addKnowledgeButton}
              disabled={submitting}
              aria-label="选择知识库"
              aria-expanded={knowledgePickerOpen}
            >
              <PlusOutlined />
            </button>
          </Popover>
          <Button
            type="primary"
            loading={submitting}
            disabled={!prompt.trim() || submitting}
            className={styles.primaryAction}
            onClick={() => void handleSubmit()}
          >
            开始创作 <RightOutlined />
          </Button>
        </div>
      </section>

      <section className={styles.recentSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>最近作品</h2>
            <p>继续完善，或从过去的灵感再次出发</p>
          </div>
          <button type="button" onClick={() => navigate('/works')}>
            进入作品空间 <RightOutlined />
          </button>
        </div>

        {recentWorks.length === 0 ? (
          <div className={styles.emptyWorks}>
            <EmptyState
              description="当前空间还没有作品"
              action={
                <Button type="primary" onClick={() => document.querySelector('textarea')?.focus()}>
                  开始第一项创作
                </Button>
              }
            />
          </div>
        ) : (
          <div className={styles.recentGrid}>
            {recentWorks.map((work) => (
              <button
                key={work._id}
                type="button"
                className={styles.recentCard}
                onClick={() => navigate(`/works/${work._id}`)}
              >
                <span className={styles.workCover}>
                  {work.finalImageUrl ? (
                    <img src={work.finalImageUrl} alt="" />
                  ) : (
                    <span>暂无预览</span>
                  )}
                </span>
                <b>{work.title}</b>
                <small>
                  {work.createdAt
                    ? new Date(work.createdAt).toLocaleDateString('zh-CN')
                    : '时间未知'}
                  {' · 图片作品'}
                </small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
