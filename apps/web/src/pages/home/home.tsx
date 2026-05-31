/**
 * 首页（创意输入页）
 *
 * 功能说明：
 * - 展示平台核心入口，用户在此输入创意描述并发起 AI 创作
 * - 顶部标题营造氛围感："准备好大干一场了吗"
 * - 下拉选择器切换当前项目空间（如瑞幸项目组）
 * - 大文本输入框让用户描述创作需求
 * - 右侧圆形蓝色按钮提交创意，调用 submitPrompt API
 */

import { useState } from 'react'
import { Select, Input, Button, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { ArrowRightOutlined } from '@ant-design/icons'
import { submitPrompt } from '@/api/workflow'
import { useUserStore } from '@/store/useUserStore'
import styles from './home.module.css'

const Home = () => {
  const navigate = useNavigate()
  const currentSpaceId = useUserStore((state) => state.currentSpaceId)
  const setCurrentSpaceId = useUserStore((state) => state.setCurrentSpaceId)

  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      message.warning('请先描述你的创意')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitPrompt({ prompt: trimmed, spaceId: currentSpaceId })
      if (res.success) {
        message.success('创意已提交，正在为你生成...')
        setPrompt('')
        navigate('/workspace', { state: { prompt: trimmed } })
      }
    } catch {
      message.error('提交失败，请稍后重试')
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

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <h1 className={styles.title}>准备好大干一场了吗</h1>

        <div className={styles.selectorRow}>
          <Select
            value={currentSpaceId}
            onChange={(val) => setCurrentSpaceId(val)}
            className={styles.spaceSelect}
            options={[
              { value: 'team', label: '项目组（成员视角）' },
              { value: 'personal', label: '个人独立空间' },
            ]}
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