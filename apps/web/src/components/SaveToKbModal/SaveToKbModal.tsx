/**
 * 存入个人知识库 - 弹窗组件
 *
 * 功能说明：
 * - 将生成的素材保存到知识库的弹窗表单
 * - 左侧展示生成图的缩略图占位区域
 * - 右侧表单包含：素材名称输入、AI 自动标签展示、保存位置选择
 * - 底部提供"取消"和"确认保存"操作按钮
 * - 接入 saveToKnowledgeBase API，支持 loading 状态和错误处理
 *
 * 使用示例：
 *   const [open, setOpen] = useState(false)
 *   <SaveToKbModal open={open} onCancel={() => setOpen(false)} />
 */

import { useState, useEffect } from 'react'
import { Modal, Input, Select, Tag, Button, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { saveToKnowledgeBase, getKnowledgeBases } from '@/api/knowledge'
import type { KnowledgeBaseOption } from '@/api/knowledge'
import styles from './SaveToKbModal.module.css'

interface SaveToKbModalProps {
  open: boolean
  onCancel: () => void
}

const defaultTags = ['咖啡', '夏日', '冰块', '透明杯']

const SaveToKbModal = ({ open, onCancel }: SaveToKbModalProps) => {
  const [materialName, setMaterialName] = useState('夏日冰咖啡杯底图')
  const [targetKbId, setTargetKbId] = useState('personal')
  const [kbOptions, setKbOptions] = useState<KnowledgeBaseOption[]>([])
  const [saving, setSaving] = useState(false)

  /** 打开弹窗时加载知识库选项列表 */
  useEffect(() => {
    if (open) {
      getKnowledgeBases().then((res) => {
        if (res.success) {
          setKbOptions(res.data)
        }
      })
    }
  }, [open])

  /** 确认保存 */
  const handleSave = async () => {
    if (!materialName.trim()) {
      message.warning('请输入素材名称')
      return
    }

    setSaving(true)
    try {
      const res = await saveToKnowledgeBase({
        materialName: materialName.trim(),
        tags: defaultTags,
        targetKbId,
      })
      if (res.success) {
        message.success('已成功存入知识库')
        onCancel()
      }
    } catch {
      message.error('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="存入个人知识库"
      open={open}
      onCancel={onCancel}
      width={640}
      footer={null}
      destroyOnClose
      className={styles.modal}
    >
      <div className={styles.body}>
        {/* 左侧预览区 */}
        <div className={styles.preview}>
          <div className={styles.placeholder}>
            <InboxOutlined className={styles.placeholderIcon} />
            <span className={styles.placeholderText}>生成图缩略图</span>
          </div>
        </div>

        {/* 右侧表单区域 */}
        <div className={styles.form}>
          {/* 素材名称 */}
          <div className={styles.field}>
            <div className={styles.fieldLabel}>素材名称</div>
            <Input
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              className={styles.input}
            />
          </div>

          {/* AI 自动标签 */}
          <div className={styles.field}>
            <div className={styles.fieldLabel}>AI 自动标签</div>
            <div className={styles.tags}>
              {defaultTags.map((tag) => (
                <Tag key={tag} className={styles.tag}>
                  {tag}
                </Tag>
              ))}
            </div>
          </div>

          {/* 保存位置 */}
          <div className={styles.field}>
            <div className={styles.fieldLabel}>保存位置</div>
            <Select
              value={targetKbId}
              onChange={(val) => setTargetKbId(val)}
              className={styles.select}
              options={kbOptions.map((kb) => ({
                value: kb.id,
                label: kb.name,
              }))}
            />
          </div>
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className={styles.footer}>
        <Button className={styles.cancelBtn} onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button type="primary" className={styles.confirmBtn} onClick={handleSave} loading={saving}>
          确认保存
        </Button>
      </div>
    </Modal>
  )
}

export default SaveToKbModal
