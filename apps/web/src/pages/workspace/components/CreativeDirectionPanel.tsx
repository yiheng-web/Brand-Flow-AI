import { useState } from 'react'
import type { CreativeDirection, WorkflowResult } from '@brand-flow/contracts'
import { Button, Card, Radio, Space, Tag } from 'antd'

import styles from './CreativeDirectionPanel.module.css'

interface CreativeDirectionPanelProps {
  creativeDirection: NonNullable<WorkflowResult['creativeDirection']>
  awaitingConfirmation: boolean
  onConfirm: (direction: CreativeDirection) => Promise<void>
}

export default function CreativeDirectionPanel({
  creativeDirection,
  awaitingConfirmation,
  onConfirm,
}: CreativeDirectionPanelProps) {
  const [selectedDirectionId, setSelectedDirectionId] = useState(
    creativeDirection.selectedDirectionId,
  )
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    const direction = creativeDirection.directions.find((item) => item.id === selectedDirectionId)
    if (!direction || loading) return
    setLoading(true)
    try {
      await onConfirm(direction)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.panel}>
      <Radio.Group
        value={selectedDirectionId}
        disabled={!awaitingConfirmation || loading}
        onChange={(event) => setSelectedDirectionId(event.target.value as string)}
      >
        <Space orientation="vertical" className={styles.options}>
          {creativeDirection.directions.map((direction) => (
            <Card key={direction.id} size="small">
              <Radio value={direction.id}>{direction.name || direction.title}</Radio>
              <p>{direction.concept || direction.summary}</p>
              <p>
                <strong>推荐：</strong>
                {direction.reason}
              </p>
              <p>
                <strong>风险：</strong>
                {direction.risk}
              </p>
              <Space wrap>
                {(direction.visualKeywords || [direction.visualStyle]).map((keyword) => (
                  <Tag key={keyword}>{keyword}</Tag>
                ))}
              </Space>
            </Card>
          ))}
        </Space>
      </Radio.Group>
      {awaitingConfirmation && (
        <Button
          type="primary"
          block
          loading={loading}
          disabled={!selectedDirectionId}
          onClick={() => void handleConfirm()}
        >
          确定创意方案
        </Button>
      )}
    </div>
  )
}
