import { useEffect, useState } from 'react'
import { Form, Input, Modal, Select, Switch, message } from 'antd'

import type { KnowledgeType, ReferenceCaseContent } from '@brand-flow/common'

import { createKnowledge } from '@/api/knowledge'
import { useUserStore } from '@/store/useUserStore'

interface SaveToKnowledgeModalProps {
  open: boolean
  defaultTitle: string
  defaultImageUrl: string
  defaultTags?: string[]
  onCancel: () => void
  onSuccess: () => void
}

export function SaveToKnowledgeModal({
  open,
  defaultTitle,
  defaultImageUrl,
  defaultTags = [],
  onCancel,
  onSuccess,
}: SaveToKnowledgeModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const spaceId = useUserStore((s) => s.currentSpaceId) || 'personal'
  const saveType = Form.useWatch('type', form) as KnowledgeType | undefined

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      type: 'reference_case',
      title: defaultTitle,
      imageUrl: defaultImageUrl,
      tags: defaultTags,
      preference: 'like',
      reason: '本次生成效果较好，可作为后续风格参考。',
      enabled: true,
    })
  }, [open, defaultTitle, defaultImageUrl, defaultTags, form])

  const handleOk = async () => {
    setLoading(true)
    try {
      const values = await form.validateFields()
      const content: ReferenceCaseContent = {
        caseName: values.title as string,
        imageUrl: values.imageUrl as string,
        preference: values.preference as 'like' | 'dislike',
        reason: values.reason as string,
        styleTags: values.tags as string[],
      }

      await createKnowledge({
        spaceId,
        type: values.type as KnowledgeType,
        title: values.title as string,
        tags: (values.tags as string[]) ?? [],
        content,
        assetUrl: values.imageUrl as string,
        enabled: values.enabled !== false,
      })
      onSuccess()
    } catch {
      message.error('保存失败，请确认知识库 API 与 MongoDB 已启动')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      cancelText="取消"
      confirmLoading={loading}
      okText="确认保存"
      open={open}
      title="保存到品牌档案"
      onCancel={onCancel}
      onOk={() => void handleOk().catch(() => undefined)}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="保存类型" name="type" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'reference_case', label: '参考案例' },
              { value: 'asset', label: '品牌素材' },
              { value: 'product', label: '产品图片' },
              { value: 'visual_guideline', label: '视觉参考' },
            ]}
          />
        </Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="图片 URL" name="imageUrl" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="标签" name="tags">
          <Select mode="tags" tokenSeparators={[',']} />
        </Form.Item>
        {saveType === 'reference_case' && (
          <Form.Item label="偏好" name="preference">
            <Select
              options={[
                { value: 'like', label: '喜欢' },
                { value: 'dislike', label: '不喜欢' },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item label="保存原因" name="reason">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="启用" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
