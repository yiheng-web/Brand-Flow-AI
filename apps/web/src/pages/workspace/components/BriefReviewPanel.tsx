import { useState } from 'react'
import type { CreativeBrief } from '@brand-flow/contracts'
import { Button, Input, Select, Space, Switch, message } from 'antd'

import { confirmBrief, regenerateBrief, updateBrief } from '@/api/workflow'

interface BriefReviewPanelProps {
  workflowId: string
  brief: CreativeBrief
  awaitingConfirmation: boolean
  onChanged: () => Promise<void>
}

export default function BriefReviewPanel({
  workflowId,
  brief,
  awaitingConfirmation,
  onChanged,
}: BriefReviewPanelProps) {
  const [draft, setDraft] = useState(brief)
  const [loading, setLoading] = useState(false)

  const execute = async (operation: () => Promise<unknown>, success: string) => {
    setLoading(true)
    try {
      await operation()
      message.success(success)
      await onChanged()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Input.TextArea
        value={draft.normalizedIntent}
        onChange={(event) => setDraft({ ...draft, normalizedIntent: event.target.value })}
        autoSize={{ minRows: 3, maxRows: 6 }}
        disabled={!awaitingConfirmation || loading}
        aria-label="图片目标"
      />
      <Input
        value={draft.targetAudience}
        onChange={(event) => setDraft({ ...draft, targetAudience: event.target.value })}
        placeholder="用户画像"
        disabled={!awaitingConfirmation || loading}
      />
      <Input
        value={draft.channel}
        onChange={(event) => setDraft({ ...draft, channel: event.target.value })}
        placeholder="使用场景"
        disabled={!awaitingConfirmation || loading}
      />
      <Select
        value={draft.outputMode}
        onChange={(outputMode) => setDraft({ ...draft, outputMode })}
        options={[
          { value: 'pure_image', label: '纯图片' },
          { value: 'graphic_design', label: '图文设计' },
          { value: 'scene_text', label: '场景文字' },
          { value: 'both', label: '两者都需要' },
        ]}
        disabled={!awaitingConfirmation || loading}
      />
      <Space>
        <span>需要后续图文合成</span>
        <Switch
          checked={draft.needsComposition}
          onChange={(needsComposition) => setDraft({ ...draft, needsComposition })}
          disabled={!awaitingConfirmation || loading}
        />
      </Space>
      {awaitingConfirmation && (
        <Space wrap>
          <Button
            type="primary"
            loading={loading}
            onClick={() => void execute(() => confirmBrief(workflowId), 'Brief 已确认')}
          >
            确认 Brief
          </Button>
          <Button
            loading={loading}
            onClick={() => void execute(() => updateBrief(workflowId, draft), 'Brief 修改已保存')}
          >
            修改并确认
          </Button>
          <Button
            loading={loading}
            onClick={() => void execute(() => regenerateBrief(workflowId), '正在重新生成 Brief')}
          >
            重新生成
          </Button>
        </Space>
      )}
    </Space>
  )
}
