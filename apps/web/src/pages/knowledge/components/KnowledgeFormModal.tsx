import { useEffect, useState } from 'react'
import { Form, Input, Modal, Select, Switch, Steps } from 'antd'

import type { KnowledgeContent, KnowledgeItem, KnowledgeType } from '@brand-flow/common'
import { KNOWLEDGE_TYPES } from '@brand-flow/common'

import { KNOWLEDGE_TYPE_LABELS } from '../constants'

interface KnowledgeFormModalProps {
  open: boolean
  spaceId: string
  editing?: KnowledgeItem | null
  defaultType?: KnowledgeType
  loading?: boolean
  onCancel: () => void
  onSubmit: (values: {
    type: KnowledgeType
    title: string
    description?: string
    tags: string[]
    content: KnowledgeContent
    assetUrl?: string
    enabled: boolean
  }) => void
}

function TagsInput({ value, onChange }: { value?: string[]; onChange?: (v: string[]) => void }) {
  return (
    <Select
      mode="tags"
      placeholder="输入后回车添加标签"
      style={{ width: '100%' }}
      tokenSeparators={[',']}
      value={value}
      onChange={onChange}
    />
  )
}

function renderTypeFields(type: KnowledgeType) {
  switch (type) {
    case 'brand_profile':
      return (
        <>
          <Form.Item label="品牌名称" name={['content', 'brandName']}>
            <Input />
          </Form.Item>
          <Form.Item label="品牌口号" name={['content', 'slogan']}>
            <Input />
          </Form.Item>
          <Form.Item label="所属行业" name={['content', 'industry']}>
            <Input />
          </Form.Item>
          <Form.Item label="目标用户" name={['content', 'targetAudience']}>
            <Input />
          </Form.Item>
          <Form.Item label="品牌关键词" name={['content', 'brandKeywords']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="禁忌关键词" name={['content', 'forbiddenKeywords']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="详细介绍" name={['content', 'description']}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </>
      )
    case 'visual_guideline':
      return (
        <>
          <Form.Item label="主色" name={['content', 'primaryColors']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="辅助色" name={['content', 'secondaryColors']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="禁用颜色" name={['content', 'forbiddenColors']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="字体风格" name={['content', 'fontStyle']}>
            <Input />
          </Form.Item>
          <Form.Item label="视觉风格" name={['content', 'visualStyle']}>
            <Input />
          </Form.Item>
          <Form.Item label="构图偏好" name={['content', 'compositionPreference']}>
            <Input />
          </Form.Item>
          <Form.Item label="光影偏好" name={['content', 'lightingPreference']}>
            <Input />
          </Form.Item>
          <Form.Item label="质感偏好" name={['content', 'texturePreference']}>
            <Input />
          </Form.Item>
        </>
      )
    case 'asset':
      return (
        <>
          <Form.Item label="素材名称" name={['content', 'assetName']}>
            <Input />
          </Form.Item>
          <Form.Item label="素材类型" name={['content', 'assetType']}>
            <Select
              options={[
                { value: 'logo', label: 'Logo' },
                { value: 'product_image', label: '产品图' },
                { value: 'icon', label: '图标' },
                { value: 'mascot', label: '吉祥物' },
                { value: 'package', label: '包装' },
                { value: 'other', label: '其他' },
              ]}
            />
          </Form.Item>
          <Form.Item label="素材 URL" name={['content', 'assetUrl']}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="用途说明" name={['content', 'usage']}>
            <Input />
          </Form.Item>
          <Form.Item label="默认使用" name={['content', 'isDefault']} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="标签" name={['content', 'tags']}>
            <TagsInput />
          </Form.Item>
        </>
      )
    case 'product':
      return (
        <>
          <Form.Item label="产品名称" name={['content', 'productName']}>
            <Input />
          </Form.Item>
          <Form.Item label="产品介绍" name={['content', 'productDescription']}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="核心卖点" name={['content', 'sellingPoints']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="适用场景" name={['content', 'scenario']}>
            <Input />
          </Form.Item>
          <Form.Item label="价格/活动" name={['content', 'priceInfo']}>
            <Input />
          </Form.Item>
          <Form.Item label="产品图 URL" name={['content', 'productImageUrl']}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="标签" name={['content', 'tags']}>
            <TagsInput />
          </Form.Item>
        </>
      )
    case 'reference_case':
      return (
        <>
          <Form.Item label="案例名称" name={['content', 'caseName']}>
            <Input />
          </Form.Item>
          <Form.Item label="案例图片 URL" name={['content', 'imageUrl']}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="偏好" name={['content', 'preference']}>
            <Select
              options={[
                { value: 'like', label: '喜欢' },
                { value: 'dislike', label: '不喜欢' },
              ]}
            />
          </Form.Item>
          <Form.Item label="原因" name={['content', 'reason']}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="风格标签" name={['content', 'styleTags']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="补充说明" name={['content', 'notes']}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </>
      )
    case 'negative_rule':
      return (
        <>
          <Form.Item label="规则标题" name={['content', 'ruleTitle']}>
            <Input />
          </Form.Item>
          <Form.Item label="规则内容" name={['content', 'ruleContent']}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="禁用元素" name={['content', 'forbiddenElements']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="禁用风格" name={['content', 'forbiddenStyles']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="禁用场景" name={['content', 'forbiddenScenes']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="禁用文案" name={['content', 'forbiddenCopywriting']}>
            <TagsInput />
          </Form.Item>
          <Form.Item label="严重程度" name={['content', 'severity']}>
            <Select
              options={[
                { value: 'low', label: '低' },
                { value: 'medium', label: '中' },
                { value: 'high', label: '高' },
              ]}
            />
          </Form.Item>
        </>
      )
    case 'layout_rule':
      return (
        <>
          <Form.Item label="规则标题" name={['content', 'ruleTitle']}>
            <Input />
          </Form.Item>
          <Form.Item label="Logo 位置" name={['content', 'logoPosition']}>
            <Input />
          </Form.Item>
          <Form.Item label="标题位置" name={['content', 'titlePosition']}>
            <Input />
          </Form.Item>
          <Form.Item label="产品主体位置" name={['content', 'productPosition']}>
            <Input />
          </Form.Item>
          <Form.Item label="二维码位置" name={['content', 'qrcodePosition']}>
            <Input />
          </Form.Item>
          <Form.Item label="文字安全区" name={['content', 'safeArea']}>
            <Input />
          </Form.Item>
          <Form.Item label="海报比例偏好" name={['content', 'posterRatio']}>
            <Input placeholder="如 3:4" />
          </Form.Item>
          <Form.Item label="边距留白规则" name={['content', 'marginRule']}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </>
      )
    default:
      return null
  }
}

export function KnowledgeFormModal({
  open,
  spaceId,
  editing,
  defaultType,
  loading,
  onCancel,
  onSubmit,
}: KnowledgeFormModalProps) {
  const [form] = Form.useForm()
  const [step, setStep] = useState(0)
  const selectedType = Form.useWatch('type', form) as KnowledgeType | undefined

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setStep(editing ? 1 : 0)
      if (editing) {
        form.setFieldsValue({
          type: editing.type,
          title: editing.title,
          description: editing.description,
          tags: editing.tags,
          content: editing.content,
          assetUrl: editing.assetUrl,
          enabled: editing.enabled,
        })
      } else {
        form.resetFields()
        form.setFieldsValue({
          type: defaultType ?? 'brand_profile',
          enabled: true,
          tags: [],
          content: {},
        })
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, editing, defaultType, form])

  const handleOk = async () => {
    if (step === 0 && !editing) {
      await form.validateFields(['type'])
      setStep(1)
      return
    }
    const values = await form.validateFields()
    onSubmit({
      type: values.type as KnowledgeType,
      title: values.title as string,
      description: values.description as string | undefined,
      tags: (values.tags as string[]) ?? [],
      content: (values.content as KnowledgeContent) ?? {},
      assetUrl: values.assetUrl as string | undefined,
      enabled: values.enabled !== false,
    })
  }

  return (
    <Modal
      cancelText="取消"
      confirmLoading={loading}
      okText={step === 0 && !editing ? '下一步' : '保存'}
      open={open}
      title={editing ? '编辑知识' : '新增知识'}
      width={640}
      onCancel={onCancel}
      onOk={() => void handleOk()}
    >
      {!editing && (
        <Steps
          current={step}
          items={[{ title: '选择类型' }, { title: '填写内容' }]}
          size="small"
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} layout="vertical">
        {(step === 0 || editing) && (
          <Form.Item
            label="知识类型"
            name="type"
            rules={[{ required: true, message: '请选择知识类型' }]}
          >
            <Select
              disabled={Boolean(editing)}
              options={KNOWLEDGE_TYPES.map((t) => ({
                value: t,
                label: KNOWLEDGE_TYPE_LABELS[t],
              }))}
            />
          </Form.Item>
        )}
        {(step === 1 || editing) && (
          <>
            <Form.Item
              label="标题"
              name="title"
              rules={[{ required: true, message: '请输入标题' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="描述" name="description">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="标签" name="tags">
              <TagsInput />
            </Form.Item>
            <Form.Item label="资源 URL（可选）" name="assetUrl">
              <Input placeholder="https://..." />
            </Form.Item>
            {selectedType && renderTypeFields(selectedType)}
            <Form.Item label="启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
            <input type="hidden" value={spaceId} />
          </>
        )}
      </Form>
    </Modal>
  )
}
