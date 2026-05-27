import { useState } from 'react'
import { Button, Input, Select, message } from 'antd'
import {
  CheckCircleOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'

import type { BrandAsset, WorkflowNodeId } from '@brand-flow/common'

import { useFlowStore } from '@/store/useFlowStore'

import { NODE_LABELS } from '../workspace.labels'
import styles from './ContextualPanel.module.css'

const nodeDescriptions: Record<WorkflowNodeId, string> = {
  intent: '解析用户创意，提取关键词与场景类型。',
  'brand-kb': '匹配品牌档案中的资料、规范与素材。',
  prompt: '综合上游信息生成正负向 Prompt。',
  'image-gen': '调用图片模型生成底图。',
  compose: '将底图、Logo 与文案进行排版合成。',
  eval: '对生成结果进行自我评估与回溯建议。',
}

function EmptyHint({ text }: { text: string }) {
  return <p className={styles.emptyHint}>{text}</p>
}

export function ContextualPanel() {
  const [editingTag, setEditingTag] = useState('')
  const prompt = useFlowStore((state) => state.prompt)
  const activeNodeId = useFlowStore((state) => state.activeNodeId)
  const nodeStates = useFlowStore((state) => state.nodeStates)
  const nodeResults = useFlowStore((state) => state.nodeResults)
  const sessionContext = useFlowStore((state) => state.sessionContext)
  const errorMessage = useFlowStore((state) => state.errorMessage)
  const streamMessages = useFlowStore((state) => state.streamMessages)
  const updateTags = useFlowStore((state) => state.updateTags)
  const updateBrandAssets = useFlowStore((state) => state.updateBrandAssets)
  const updatePromptResult = useFlowStore((state) => state.updatePromptResult)
  const updateGenerationSettings = useFlowStore((state) => state.updateGenerationSettings)
  const setNodeStatus = useFlowStore((state) => state.setNodeStatus)
  const setActiveNode = useFlowStore((state) => state.setActiveNode)
  const appendStreamMessage = useFlowStore((state) => state.appendStreamMessage)

  const nodeStatus = nodeStates[activeNodeId]
  const tags = nodeResults.intent?.tags ?? []
  const brandAssets = nodeResults['brand-kb']?.brandAssets ?? []
  const promptResult = nodeResults.prompt
  const baseImageUrl = nodeResults['image-gen']?.baseImageUrl

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

  const handleRerunNode = () => {
    message.info('MVP 阶段请使用顶部「重新生成」触发整链重跑。')
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{NODE_LABELS[activeNodeId]}</span>
        <span className={styles.statusTag}>{nodeStatus}</span>
      </div>
      <p className={styles.nodeDesc}>{nodeDescriptions[activeNodeId]}</p>
      {nodeStatus === 'FAILED' && errorMessage && (
        <div className={styles.errorBox}>错误：{errorMessage}</div>
      )}

      <div className={styles.content}>
        {activeNodeId === 'intent' && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>用户原始 Prompt</h3>
            <div className={styles.summaryBox}>{prompt || <EmptyHint text="暂无数据" />}</div>
            <h3 className={styles.sectionTitle}>解析关键词</h3>
            {tags.length === 0 ? (
              <EmptyHint text="等待节点运行" />
            ) : (
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
            )}
            <Input
              placeholder="新增关键词"
              value={editingTag}
              onChange={(event) => setEditingTag(event.target.value)}
              onPressEnter={handleTagSubmit}
            />
            <h3 className={styles.sectionTitle}>场景类型</h3>
            <p>{nodeResults.intent?.sceneType ?? sessionContext.sceneType ?? '等待节点运行'}</p>
          </section>
        )}

        {activeNodeId === 'brand-kb' && (
          <section className={styles.section}>
            <p>
              知识库：
              {sessionContext.useKnowledge === false ? '未启用' : '已启用'}
            </p>
            {nodeResults['brand-kb']?.knowledgeContext ? (
              <pre className={styles.codeBlock}>{nodeResults['brand-kb'].knowledgeContext}</pre>
            ) : nodeResults['brand-kb']?.matchedSummary ? (
              <pre className={styles.codeBlock}>{nodeResults['brand-kb'].matchedSummary}</pre>
            ) : brandAssets.length > 0 ? (
              brandAssets.map((asset) => (
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
              ))
            ) : (
              <EmptyHint text="暂无品牌档案，可前往知识库补充" />
            )}
            <Link to="/knowledge">前往品牌档案 →</Link>
          </section>
        )}

        {activeNodeId === 'prompt' && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>上游信息汇总</h3>
            <div className={styles.summaryBox}>
              <span>意图：{tags.join('、') || '等待解析'}</span>
              <span>
                资产：
                {brandAssets
                  .filter((asset) => asset.selected)
                  .map((asset) => asset.label)
                  .join('、') || '暂无'}
              </span>
            </div>
            <h3 className={styles.sectionTitle}>正向 Prompt</h3>
            {promptResult?.positivePrompt ? (
              <>
                <Input.TextArea
                  rows={5}
                  value={promptResult.positivePrompt}
                  onChange={(event) =>
                    updatePromptResult(event.target.value, promptResult.negativePrompt ?? '')
                  }
                />
                <Button
                  icon={<CopyOutlined />}
                  size="small"
                  onClick={() => {
                    void navigator.clipboard.writeText(promptResult.positivePrompt ?? '')
                    message.success('已复制')
                  }}
                >
                  复制正向 Prompt
                </Button>
              </>
            ) : (
              <EmptyHint text="等待节点运行" />
            )}
            <h3 className={styles.sectionTitle}>负向 Prompt</h3>
            {promptResult?.negativePrompt ? (
              <Input.TextArea
                rows={3}
                value={promptResult.negativePrompt}
                onChange={(event) =>
                  updatePromptResult(promptResult.positivePrompt ?? '', event.target.value)
                }
              />
            ) : (
              <EmptyHint text="暂无数据" />
            )}
          </section>
        )}

        {activeNodeId === 'image-gen' && (
          <section className={styles.section}>
            <p>Provider：Pollinations / OpenAI（由后端配置）</p>
            <p>
              模型：
              {sessionContext.imageModel ?? nodeResults['image-gen']?.imageParams?.model ?? '—'}
            </p>
            <p>比例：{sessionContext.imageRatio ?? sessionContext.imageSize ?? '—'}</p>
            {baseImageUrl ? (
              <>
                <img alt="底图" className={styles.previewImg} src={baseImageUrl} />
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void navigator.clipboard.writeText(baseImageUrl)
                    message.success('已复制')
                  }}
                >
                  复制图片链接
                </Button>
              </>
            ) : (
              <EmptyHint text="等待节点运行" />
            )}
            <Select
              value={sessionContext.imageModel ?? 'Flux.1 [Snel]'}
              options={[
                { value: 'Flux.1 [Snel]', label: 'Flux.1 [Snel]' },
                { value: 'pollinations', label: 'Pollinations' },
              ]}
              onChange={(imageModel) => updateGenerationSettings({ imageModel })}
            />
            <Button block icon={<PlayCircleOutlined />} type="primary" onClick={handleGenerate}>
              下发任务并生成底图
            </Button>
          </section>
        )}

        <Button block icon={<ReloadOutlined />} style={{ marginTop: 8 }} onClick={handleRerunNode}>
          重新运行该节点
        </Button>

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
