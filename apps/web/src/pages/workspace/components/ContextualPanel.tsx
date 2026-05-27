import { useState } from 'react'
import { Button, Input, Select } from 'antd'
import { CheckCircleOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons'

import type { BrandAsset, WorkflowNodeId } from '@brand-flow/common'

import { useFlowStore } from '@/store/useFlowStore'

import styles from './ContextualPanel.module.css'

const nodeTitles: Record<WorkflowNodeId, string> = {
  intent: '意图解析节点',
  'brand-kb': '品牌知识库节点',
  prompt: 'Prompt 专家节点',
  'image-gen': '图像生成节点',
  compose: '排版与合成节点',
  eval: '自我评估节点',
}

export function ContextualPanel() {
  const [editingTag, setEditingTag] = useState('')
  const activeNodeId = useFlowStore((state) => state.activeNodeId)
  const nodeResults = useFlowStore((state) => state.nodeResults)
  const sessionContext = useFlowStore((state) => state.sessionContext)
  const streamMessages = useFlowStore((state) => state.streamMessages)
  const updateTags = useFlowStore((state) => state.updateTags)
  const updateBrandAssets = useFlowStore((state) => state.updateBrandAssets)
  const updatePromptResult = useFlowStore((state) => state.updatePromptResult)
  const updateGenerationSettings = useFlowStore((state) => state.updateGenerationSettings)
  const setNodeStatus = useFlowStore((state) => state.setNodeStatus)
  const setActiveNode = useFlowStore((state) => state.setActiveNode)
  const appendStreamMessage = useFlowStore((state) => state.appendStreamMessage)

  const tags = nodeResults.intent?.tags ?? []
  const brandAssets = nodeResults['brand-kb']?.brandAssets ?? []
  const promptResult = nodeResults.prompt

  const handleTagSubmit = () => {
    const trimmed = editingTag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      updateTags([...tags, trimmed])
    }
    setEditingTag('')
  }

  const handleAssetToggle = (asset: BrandAsset) => {
    updateBrandAssets(
      brandAssets.map((item) =>
        item.id === asset.id ? { ...item, selected: !item.selected } : item,
      ),
    )
  }

  const handleGenerate = () => {
    setNodeStatus('image-gen', 'RUNNING')
    setActiveNode('image-gen')
    appendStreamMessage('图像生成任务已下发，等待队列执行。')
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>节点属性：{nodeTitles[activeNodeId]}</span>
      </div>
      <div className={styles.content}>
        {activeNodeId === 'intent' ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>解析出的关键词</h3>
            <div className={styles.tagList}>
              {tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                  <button
                    className={styles.remove}
                    type="button"
                    onClick={() => updateTags(tags.filter((item) => item !== tag))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <Input
              placeholder="新增标签"
              value={editingTag}
              onChange={(event) => setEditingTag(event.target.value)}
              onPressEnter={handleTagSubmit}
            />
          </section>
        ) : null}

        {activeNodeId === 'brand-kb' ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>自动匹配到的品牌素材</h3>
            {brandAssets.map((asset) => (
              <button
                key={asset.id}
                className={`${styles.assetCard} ${asset.selected ? styles.assetActive : ''}`}
                type="button"
                onClick={() => handleAssetToggle(asset)}
              >
                <span className={styles.swatch} style={{ background: asset.value }} />
                <span>
                  <strong>{asset.label}</strong>
                  <br />
                  <small>{asset.selected ? '已选用' : '未选用'}</small>
                </span>
                {asset.selected ? <CheckCircleOutlined /> : null}
              </button>
            ))}
            <Button icon={<PlusOutlined />}>从本地自定义添加</Button>
          </section>
        ) : null}

        {activeNodeId === 'prompt' ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>上游信息汇总</h3>
            <div className={styles.summaryBox}>
              <span>意图：{tags.join('、') || '等待解析'}</span>
              <span>
                资产：
                {brandAssets
                  .filter((asset) => asset.selected)
                  .map((asset) => asset.label)
                  .join('、')}
              </span>
            </div>
            <Input.TextArea
              rows={6}
              value={promptResult?.positivePrompt ?? ''}
              onChange={(event) =>
                updatePromptResult(event.target.value, promptResult?.negativePrompt ?? '')
              }
            />
            <Input.TextArea
              rows={3}
              value={promptResult?.negativePrompt ?? ''}
              onChange={(event) =>
                updatePromptResult(promptResult?.positivePrompt ?? '', event.target.value)
              }
            />
          </section>
        ) : null}

        {activeNodeId === 'image-gen' ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>选择底图大模型</h3>
            <Select
              value={sessionContext.imageModel ?? 'Flux.1 [Snel]'}
              options={[
                { value: 'Flux.1 [Snel]', label: 'Flux.1 [Snel]' },
                { value: 'SDXL 1.0', label: 'SDXL 1.0' },
                { value: 'Private Model', label: '团队私有模型' },
              ]}
              onChange={(imageModel) => updateGenerationSettings({ imageModel })}
            />
            <Select
              value={sessionContext.imageSize ?? '3:4'}
              options={[
                { value: '3:4', label: '3:4 竖版海报' },
                { value: '1:1', label: '1:1 方图' },
                { value: '16:9', label: '16:9 横图' },
              ]}
              onChange={(imageSize) => updateGenerationSettings({ imageSize })}
            />
            <Button block icon={<PlayCircleOutlined />} type="primary" onClick={handleGenerate}>
              下发任务并生成底图
            </Button>
          </section>
        ) : null}

        <div className={styles.streamBox}>
          <strong>实时事件</strong>
          {(streamMessages.length ? streamMessages.slice(-6) : ['等待工作流事件...']).map(
            (item, index) => (
              <p key={`${item}-${index}`}>{item}</p>
            ),
          )}
        </div>
      </div>
    </aside>
  )
}
