/**
 * 首页（创意输入页）
 *
 * 功能说明：
 * - 顶部 Space 选择器：点击弹出空间列表（个人/团队/企业），可切换
 * - 主内容区：标题 + 创意输入框 + 当前空间信息 + 开始创作按钮
 * - 底部卡片：产品灵感 / 创作记录 / 使用分析
 */

import { useState, useEffect, useRef } from 'react'
import { Input, Button, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { DownOutlined, PlusOutlined } from '@ant-design/icons'
import { submitPrompt } from '@/api/workflow'
import { getMySpaces, switchEnterprise } from '@/api/org'
import type { SpaceData } from '@/api/org'
import { useUserStore, type SpaceItem, type SpaceType } from '@/store/useUserStore'
import { useWorkflowStore } from '@/store/useWorkflowStore'
import styles from './home.module.css'

/** 空间类型对应的标签文案和描述 */
const SPACE_META: Record<SpaceType, { label: string; defaultDesc: string }> = {
  personal: {
    label: '个人',
    defaultDesc: '作品和知识归你所有',
  },
  team: {
    label: '团队',
    defaultDesc: '品牌新品的AI协同和企业品牌规则',
  },
  enterprise: {
    label: '企业',
    defaultDesc: '品牌级全局与协作权限范围',
  },
}

/**
 * 将后端 SpaceData 转换为前端 SpaceItem（补充默认个人空间）
 */
function buildSpaceList(apiSpaces: SpaceData[]): SpaceItem[] {
  // 始终包含个人空间（前端固定，不依赖后端）
  const list: SpaceItem[] = [
    {
      id: 'personal',
      name: '个人空间',
      type: 'personal',
      description: SPACE_META.personal.defaultDesc,
    },
  ]

  // 追加后端返回的团队和企业空间
  for (const s of apiSpaces) {
    if (s.type === 'personal') continue // 跳过后端的个人空间（前端已有）
    list.push({
      id: s.spaceId,
      name: s.name,
      type: s.type,
      description: s.description || SPACE_META[s.type].defaultDesc,
      enterpriseId: s.enterpriseId,
    })
  }

  return list
}

/** 空间选择下拉面板 */
function SpaceDropdown({
  currentSpaceId,
  spaces,
  onSelect,
}: {
  currentSpaceId: string | null
  spaces: SpaceItem[]
  onSelect: (space: SpaceItem) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const currentSpace = spaces.find((s) => s.id === currentSpaceId)

  return (
    <div className={styles.spaceDropdown} ref={ref}>
      <button type="button" className={styles.spaceTrigger} onClick={() => setOpen(!open)}>
        <span className={styles.spaceTriggerText}>{currentSpace?.name || '选择空间'}</span>
        <DownOutlined className={styles.spaceTriggerIcon} />
      </button>

      {open && (
        <div className={styles.spacePanel}>
          {spaces.map((space) => {
            const meta = SPACE_META[space.type]
            const isActive = space.id === currentSpaceId
            return (
              <div
                key={space.id}
                className={`${styles.spaceOption} ${isActive ? styles.spaceOptionActive : ''}`}
                onClick={() => {
                  onSelect(space)
                  setOpen(false)
                }}
              >
                <div className={styles.optionMain}>
                  <span className={styles.optionName}>{space.name}</span>
                  <span className={`${styles.optionBadge} ${styles[`optionBadge_${space.type}`]}`}>
                    {meta.label}
                  </span>
                </div>
                <div className={styles.optionDesc}>{space.description}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const Home = () => {
  const navigate = useNavigate()

  // ---- Store ----
  const currentSpaceId = useUserStore((s) => s.currentSpaceId)
  const currentSpaceName = useUserStore((s) => s.currentSpaceName)
  const currentSpaceType = useUserStore((s) => s.currentSpaceType)
  const spaces = useUserStore((s) => s.spaces)
  const setSpaces = useUserStore((s) => s.setSpaces)
  const setCurrentSpace = useUserStore((s) => s.setCurrentSpace)
  const setWorkflowId = useWorkflowStore((s) => s.setWorkflowId)

  // ---- 本地状态 ----
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingSpaces, setLoadingSpaces] = useState(true)

  // ---- 加载空间列表 ----
  useEffect(() => {
    const loadSpaces = async () => {
      try {
        const res = await getMySpaces()
        const apiSpaces: SpaceData[] = res.data || []
        const list = buildSpaceList(apiSpaces)
        setSpaces(list)
      } catch {
        // 后端接口不可用时，使用默认个人空间
        setSpaces(buildSpaceList([]))
      } finally {
        setLoadingSpaces(false)
      }
    }
    loadSpaces()
  }, [setSpaces])

  // ---- 切换空间 ----
  const handleSwitchSpace = async (space: SpaceItem) => {
    setCurrentSpace(space.id)
    // 如果是企业/团队空间，同步调用后端切换企业接口
    if (space.enterpriseId && space.type !== 'personal') {
      try {
        await switchEnterprise(space.enterpriseId)
      } catch {
        // 静默处理
      }
    }
  }

  // ---- 提交创意 → 跳转工作台 ----
  const handleSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      message.warning('请先描述你的创意')
      return
    }

    setSubmitting(true)
    try {
      // submitPrompt 返回的是 WorkflowData（拦截器已解包 { success, data }）
      const workflowData = await submitPrompt({
        prompt: trimmed,
        spaceId: currentSpaceId || 'personal',
        spaceType: currentSpaceType,
      })
      const workflowId = workflowData?.id
      if (workflowId) {
        setWorkflowId(workflowId)
      }
      message.success('创意已提交，正在为你生成...')
      setPrompt('')
      navigate('/workspace', { state: { prompt: trimmed, workflowId } })
    } catch {
      // 错误已由 api/index.ts 拦截器统一提示，此处无需重复提示
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  /** 直接跳转工作台（不提交创意） */
  const handleGoWorkspace = () => {
    navigate('/workspace')
  }

  return (
    <div className={styles.wrapper}>
      {/* ===== 顶部栏：Logo + Space 选择器 + 操作区 ===== */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>DF</span>
            <span className={styles.logoText}>Brand-Flow AI</span>
          </div>
          <div className={styles.topBarDivider} />
          <SpaceDropdown
            currentSpaceId={currentSpaceId}
            spaces={spaces}
            onSelect={handleSwitchSpace}
          />
        </div>
        <div className={styles.topBarRight}>
          <span className={styles.quotaText}>剩余额度 800</span>
          <Button type="text" size="small">
            导出
          </Button>
          <Button type="text" size="small" danger>
            退出
          </Button>
        </div>
      </header>

      {/* ===== 主内容区 ===== */}
      <main className={styles.mainContent}>
        <div className={styles.heroSection}>
          <h1 className={styles.title}>今天想创作什么？</h1>
          <p className={styles.subtitle}>
            把需求直接写在下面，系统会根据当前 Space 自动带入可用知识和规则。
          </p>

          {/* 创意输入区 */}
          <div className={styles.inputCard}>
            <Input.TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='帮我做一套夏日冰鲜椰新品海报，清爽年轻，适合小红书发布。文案是"夏日第一杯清爽椰咖"，画面要有冰块、阳光和热带品感...'
              className={styles.promptInput}
              autoSize={{ minRows: 4, maxRows: 8 }}
              disabled={submitting}
            />

            {/* 输入框底部：空间信息 + 标签 + 操作 */}
            <div className={styles.inputFooter}>
              <div className={styles.footerLeft}>
                <span className={styles.spaceLabel}>
                  {currentSpaceName}
                  {currentSpaceType !== 'personal' && <>：将启用团队AI知识库和企业品牌规则。</>}
                </span>
                <div className={styles.tagRow}>
                  {currentSpaceType !== 'personal' ? (
                    <>
                      <span className={styles.tag}>企业品牌规范</span>
                      <span className={styles.tag}>瑞幸视觉文件作</span>
                      <button type="button" className={styles.addTagBtn}>
                        <PlusOutlined /> 添加
                      </button>
                    </>
                  ) : (
                    <span className={styles.tagHint}>个人空间无绑定知识库</span>
                  )}
                </div>
              </div>

              <div className={styles.footerRight}>
                <button
                  type="button"
                  className={styles.switchSpaceBtn}
                  onClick={() => {
                    // 触发内容区的 SpaceDropdown 打开（通过 ref 或状态联动）
                    const event = new CustomEvent('open-space-dropdown')
                    window.dispatchEvent(event)
                  }}
                >
                  切换 Space
                </button>
              </div>
            </div>
          </div>

          {/* 开始创作按钮 */}
          <div className={styles.actionRow}>
            <Button
              type="primary"
              size="large"
              className={styles.createBtn}
              onClick={handleSubmit}
              loading={submitting}
            >
              开始创作
            </Button>
          </div>
        </div>

        {/* ===== 底部快捷入口卡片 ===== */}
        <div className={styles.cardsRow}>
          <div className={styles.quickCard}>
            <div className={styles.cardLabel}>产品灵感</div>
            <div className={styles.cardValue}>瑞幸新品项目组</div>
          </div>
          <div className={styles.quickCard}>
            <div className={styles.cardLabel}>创作记录</div>
            <div className={styles.cardValue}>团队作品</div>
          </div>
          <div className={styles.quickCard}>
            <div className={styles.cardLabel}>使用分析</div>
            <div className={styles.cardValue}>已启用</div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Home
