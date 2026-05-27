import { useState } from 'react'
import { Button, Input, message } from 'antd'
import {
  PictureOutlined,
  SendOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

import { submitPrompt } from '@/api/workflow'
import { useAppStore } from '@/store/useAppStore'
import { useFlowStore } from '@/store/useFlowStore'
import { useUserStore } from '@/store/useUserStore'

import styles from './HomePage.module.css'

export function HomePage() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const userName = useUserStore((state) => state.name)
  const currentSpaceId = useUserStore((state) => state.currentSpaceId)
  const hasTeam = useAppStore((state) => state.hasTeam)
  const chatMode = useAppStore((state) => state.chatMode)
  const setChatMode = useAppStore((state) => state.setChatMode)
  const setWorkflow = useFlowStore((state) => state.setWorkflow)

  const handleModeChange = (mode: 'personal' | 'team') => {
    if (mode === 'team' && !hasTeam) {
      message.warning('你还没有加入任何团队，请先去个人中心创建或加入团队。')
      return
    }
    setChatMode(mode)
  }

  const handleSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      message.warning('请先描述你的创意')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitPrompt({
        prompt: trimmed,
        spaceId: chatMode === 'team' ? currentSpaceId : 'personal',
        scope: chatMode,
      })
      setWorkflow(res.data.id, trimmed)
      message.success('创意已提交，正在为你生成工作流。')
      navigate(`/workspace?workflowId=${res.data.id}`)
    } catch {
      const localId = `local-${Date.now()}`
      setWorkflow(localId, trimmed)
      message.info('后端暂不可用，已进入本地演示工作流。')
      navigate(`/workspace?workflowId=${localId}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.greetingHeader}>
        <h1>你好，{userName}</h1>
        <p>今天想让 AI 帮你生成什么品牌图文？</p>
      </div>

      <div className={styles.modeSelector}>
        <button
          className={`${styles.modeButton} ${chatMode === 'personal' ? styles.modeButtonActive : ''}`}
          type="button"
          onClick={() => handleModeChange('personal')}
        >
          <UserOutlined />
          个人模式
        </button>
        <button
          className={`${styles.modeButton} ${chatMode === 'team' ? styles.modeButtonActive : ''}`}
          type="button"
          onClick={() => handleModeChange('team')}
        >
          <TeamOutlined />
          团队模式
        </button>
      </div>

      <div className={styles.chatInputContainer}>
        <ThunderboltOutlined className={styles.magicIcon} />
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          className={styles.promptInput}
          disabled={submitting}
          placeholder="输入提示词，例如：为瑞幸咖啡生成一张夏日海报..."
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault()
              void handleSubmit()
            }
          }}
        />
        <Button className={styles.actionButton} icon={<PictureOutlined />} shape="circle" />
        <Button
          className={styles.submitButton}
          icon={<SendOutlined />}
          loading={submitting}
          shape="circle"
          onClick={() => void handleSubmit()}
        />
      </div>
    </div>
  )
}
