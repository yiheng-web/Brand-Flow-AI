/**
 * 首页（创意输入页）
 *
 * 功能说明：
 * - 展示平台核心入口，用户在此输入创意描述并发起 AI 创作
 * - 顶部标题营造氛围感："准备好大干一场了吗"
 * - 下拉选择器切换当前企业（从 /org/enterprises 动态加载）
 * - 大文本输入框让用户描述创作需求
 * - 右侧圆形蓝色按钮提交创意，调用 submitPrompt API
 */

import { useState, useEffect } from 'react'
import { Select, Input, Button, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { ArrowRightOutlined } from '@ant-design/icons'
import { submitPrompt } from '@/api/workflow'
import { getMyEnterprises, switchEnterprise } from '@/api/org'
import { useUserStore } from '@/store/useUserStore'
import { useWorkflowStore } from '@/store/useWorkflowStore'
import styles from './home.module.css'

const Home = () => {
  const navigate = useNavigate()
  const currentEnterpriseId = useUserStore((state) => state.currentEnterpriseId)
  const enterprises = useUserStore((state) => state.enterprises)
  const setCurrentEnterpriseId = useUserStore((state) => state.setCurrentEnterpriseId)
  const setEnterprises = useUserStore((state) => state.setEnterprises)
  const setWorkflowId = useWorkflowStore((state) => state.setWorkflowId)
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 加载企业列表
  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        const res = await getMyEnterprises()
        if (res.data) {
          setEnterprises(res.data)
        }
      } catch {
        // 静默处理，使用默认值
      }
    }
    loadEnterprises()
  }, [setEnterprises])

  const handleSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      message.warning('请先描述你的创意')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitPrompt({ prompt: trimmed, spaceId: currentEnterpriseId || '' })
      if (res.success) {
        const workflowId = res.data?.id
        if (workflowId) {
          setWorkflowId(workflowId)
        }
        message.success('创意已提交，正在为你生成...')
        setPrompt('')
        navigate('/workspace', { state: { prompt: trimmed, workflowId } })
      }
    } catch {
      message.error('提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  /** 切换企业 */
  const handleSwitchEnterprise = async (enterpriseId: string) => {
    setCurrentEnterpriseId(enterpriseId)
    try {
      await switchEnterprise(enterpriseId)
    } catch {
      // 静默处理
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // 企业下拉选项
  const enterpriseOptions = enterprises.map((ent) => ({
    value: ent.enterpriseId,
    label: ent.name,
  }))

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <h1 className={styles.title}>准备好大干一场了吗</h1>

        <div className={styles.selectorRow}>
          <Select
            value={currentEnterpriseId}
            onChange={handleSwitchEnterprise}
            className={styles.spaceSelect}
            options={enterpriseOptions.length > 0 ? enterpriseOptions : [{ value: '', label: '加载中...' }]}
            placeholder="选择企业"
          />
        </div>

        <div className={styles.inputRow}>
          <Input.TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
              placeholder="描述你的创意，例如：为某品牌做一张夏日户外海报，极简风格..."
            className={styles.promptInput}
            autoSize={{ minRows: 2, maxRows: 6 }}
            disabled={submitting}
          />
          <Button
            type="primary"
            shape="circle"
            icon={<ArrowRightOutlined />}
            className={styles.submitBtn}
            onClick={handleSubmit}
            loading={submitting}
          />
        </div>
      </div>
    </div>
  )
}

export default Home
