/**
 * 首页（创意输入页）
 *
 * 功能说明：
 * - 顶部 Space 选择器：点击弹出空间列表（个人/团队/企业），可切换
 * - 主内容区：标题 + 创意输入框 + 当前空间信息 + 开始创作按钮
 * - 底部卡片：产品灵感 / 创作记录 / 使用分析
 */

import { useState, useEffect, useRef } from 'react'
import { Input, Button, Select, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { DownOutlined, LogoutOutlined } from '@ant-design/icons'
import { submitPrompt } from '@/api/workflow'
import { getMySpaces, switchEnterprise } from '@/api/org'
import type { SpaceData } from '@/api/org'
import { useUserStore, type SpaceItem, type SpaceType } from '@/store/useUserStore'
import { useWorkflowStore } from '@/store/useWorkflowStore'
import { useAuthStore } from '@/store/useAuthStore'
import { getKnowledgeList, type KnowledgeData } from '@/api/knowledge'
import {
  BRAND_VISUAL_STYLES,
  IMAGE_ASPECT_RATIOS,
  type BrandRequirementInput,
} from '@brand-flow/contracts'
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

  useEffect(() => {
    const handleOpen = () => setOpen(true)
    window.addEventListener('open-space-dropdown', handleOpen)
    return () => window.removeEventListener('open-space-dropdown', handleOpen)
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
              <button
                type="button"
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
              </button>
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
  const logout = useAuthStore((s) => s.logout)
  const setToken = useAuthStore((s) => s.setToken)

  // ---- 本地状态 ----
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeData[]>([])
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([])
  const [requirements, setRequirements] = useState<BrandRequirementInput>({
    brandName: '',
    productCategory: '',
    productDescription: '',
    targetAudience: '',
    usageScenario: '',
    visualStyles: [],
    colorPreference: '',
    aspectRatio: '1:1',
  })

  // ---- 加载空间列表 ----
  useEffect(() => {
    const loadSpaces = async () => {
      try {
        const apiSpaces = await getMySpaces()
        const list = buildSpaceList(apiSpaces)
        setSpaces(list)
      } catch {
        // 后端接口不可用时，使用默认个人空间
        setSpaces(buildSpaceList([]))
      }
    }
    loadSpaces()
  }, [setSpaces])

  useEffect(() => {
    getKnowledgeList(currentSpaceId || 'personal')
      .then(setKnowledgeBases)
      .catch(() => setKnowledgeBases([]))
  }, [currentSpaceId])

  // ---- 切换空间 ----
  const handleSwitchSpace = async (space: SpaceItem) => {
    if (space.enterpriseId && space.type !== 'personal') {
      try {
        const result = await switchEnterprise(space.enterpriseId)
        setToken(result.access_token)
      } catch {
        message.error('切换企业身份失败，当前 Space 未改变')
        return
      }
    }
    setCurrentSpace(space.id)
    setSelectedKnowledgeBaseIds([])
  }

  // ---- 提交创意 → 跳转工作台 ----
  const handleSubmit = async () => {
    const missingStructured =
      [
        requirements.brandName,
        requirements.productCategory,
        requirements.productDescription,
        requirements.targetAudience,
        requirements.usageScenario,
      ].some((value) => !value.trim()) || requirements.visualStyles.length === 0
    if (missingStructured) {
      message.warning('请完整填写品牌、产品、目标用户、使用场景和视觉风格')
      return
    }
    const trimmed =
      prompt.trim() ||
      `为${requirements.brandName}的${requirements.productCategory}创作${requirements.usageScenario}品牌图片：${requirements.productDescription}`

    setSubmitting(true)
    try {
      // submitPrompt 返回的是 WorkflowData（拦截器已解包 { success, data }）
      const workflowData = await submitPrompt({
        prompt: trimmed,
        spaceId: currentSpaceId || 'personal',
        spaceType: currentSpaceType,
        selectedKnowledgeBaseIds,
        requirements,
      })
      const workflowId = workflowData?.id
      if (workflowId) {
        setWorkflowId(workflowId)
      }
      message.success('创意已提交，正在为你生成...')
      setPrompt('')
      navigate('/workspace', { state: { prompt: trimmed, workflowId, selectedKnowledgeBaseIds } })
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

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
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
          <Button type="text" size="small" onClick={() => navigate('/works')}>
            作品中心
          </Button>
          <Button type="text" size="small" danger icon={<LogoutOutlined />} onClick={handleLogout}>
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
            <Select
              mode="multiple"
              maxCount={3}
              value={selectedKnowledgeBaseIds}
              onChange={setSelectedKnowledgeBaseIds}
              options={knowledgeBases.map((item) => ({
                value: item._id || item.id,
                label: item.name,
              }))}
              placeholder="选择 0～3 个知识库（可不选）"
              style={{ width: '100%', marginBottom: 16 }}
              disabled={submitting}
            />
            <Input.TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='帮我做一套夏日冰鲜椰新品海报，清爽年轻，适合小红书发布。文案是"夏日第一杯清爽椰咖"，画面要有冰块、阳光和热带品感...'
              className={styles.promptInput}
              autoSize={{ minRows: 4, maxRows: 8 }}
              disabled={submitting}
            />
            <div className={styles.requirementGrid}>
              <Input
                value={requirements.brandName}
                onChange={(event) =>
                  setRequirements((old) => ({ ...old, brandName: event.target.value }))
                }
                placeholder="品牌名称 *"
                disabled={submitting}
              />
              <Input
                value={requirements.productCategory}
                onChange={(event) =>
                  setRequirements((old) => ({ ...old, productCategory: event.target.value }))
                }
                placeholder="产品类别 *"
                disabled={submitting}
              />
              <Input
                value={requirements.productDescription}
                onChange={(event) =>
                  setRequirements((old) => ({ ...old, productDescription: event.target.value }))
                }
                placeholder="产品描述 *"
                disabled={submitting}
              />
              <Input
                value={requirements.targetAudience}
                onChange={(event) =>
                  setRequirements((old) => ({ ...old, targetAudience: event.target.value }))
                }
                placeholder="目标用户 *"
                disabled={submitting}
              />
              <Input
                value={requirements.usageScenario}
                onChange={(event) =>
                  setRequirements((old) => ({ ...old, usageScenario: event.target.value }))
                }
                placeholder="图片使用场景 *"
                disabled={submitting}
              />
              <Input
                value={requirements.colorPreference}
                onChange={(event) =>
                  setRequirements((old) => ({ ...old, colorPreference: event.target.value }))
                }
                placeholder="色彩偏好（可选）"
                disabled={submitting}
              />
              <Select
                mode="multiple"
                maxCount={3}
                value={requirements.visualStyles}
                options={BRAND_VISUAL_STYLES.map((style) => ({ value: style, label: style }))}
                onChange={(visualStyles) => setRequirements((old) => ({ ...old, visualStyles }))}
                placeholder="视觉风格，最多 3 个 *"
                disabled={submitting}
              />
              <Select
                value={requirements.aspectRatio}
                options={IMAGE_ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
                onChange={(aspectRatio) => setRequirements((old) => ({ ...old, aspectRatio }))}
                placeholder="图片比例"
                disabled={submitting}
              />
            </div>

            {/* 输入框底部：空间信息 + 标签 + 操作 */}
            <div className={styles.inputFooter}>
              <div className={styles.footerLeft}>
                <span className={styles.spaceLabel}>
                  {currentSpaceName}
                  {currentSpaceType !== 'personal' && <>：将启用团队AI知识库和企业品牌规则。</>}
                </span>
                <div className={styles.tagRow}>
                  <span className={styles.tagHint}>
                    已选择 {selectedKnowledgeBaseIds.length}/3 个知识库
                  </span>
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
