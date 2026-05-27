import { Descriptions, Form, Modal, Select, Switch } from 'antd'

import type { ImageRatio, SceneType } from '@brand-flow/common'
import { IMAGE_RATIOS, SCENE_TYPES } from '@brand-flow/common'

import { DEFAULT_MODEL_INFO } from '@/config/modelInfo'

export interface CreateTaskFormValues {
  spaceId: string
  sceneType: SceneType
  imageRatio: ImageRatio
  useKnowledge: boolean
}

interface CreateTaskModalProps {
  open: boolean
  prompt: string
  loading?: boolean
  defaultSpaceId: string
  onCancel: () => void
  onConfirm: (values: CreateTaskFormValues) => void
}

const SCENE_LABELS: Record<SceneType, string> = {
  brand_poster: '品牌海报',
  product_image: '产品主图',
  xiaohongshu_cover: '小红书封面',
  wechat_banner: '公众号头图',
  general: '通用图片',
}

export function CreateTaskModal({
  open,
  prompt,
  loading,
  defaultSpaceId,
  onCancel,
  onConfirm,
}: CreateTaskModalProps) {
  const [form] = Form.useForm<CreateTaskFormValues>()

  return (
    <Modal
      cancelText="取消"
      confirmLoading={loading}
      okText="开始生成"
      open={open}
      title="确认创作任务"
      width={520}
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then((values) => onConfirm(values))
      }}
    >
      <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="创作描述">{prompt}</Descriptions.Item>
      </Descriptions>

      <Form
        form={form}
        initialValues={{
          spaceId: defaultSpaceId,
          sceneType: 'general',
          imageRatio: '1:1',
          useKnowledge: true,
        }}
        layout="vertical"
      >
        <Form.Item label="品牌空间" name="spaceId" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'personal', label: '个人空间 (personal)' },
              { value: defaultSpaceId, label: `当前空间 (${defaultSpaceId})` },
            ]}
          />
        </Form.Item>
        <Form.Item label="生成场景" name="sceneType" rules={[{ required: true }]}>
          <Select options={SCENE_TYPES.map((s) => ({ value: s, label: SCENE_LABELS[s] }))} />
        </Form.Item>
        <Form.Item label="图片比例" name="imageRatio" rules={[{ required: true }]}>
          <Select options={IMAGE_RATIOS.map((r) => ({ value: r, label: r }))} />
        </Form.Item>
        <Form.Item label="启用品牌档案" name="useKnowledge" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item label="模型配置">
          <span style={{ color: '#666' }}>{DEFAULT_MODEL_INFO}</span>
        </Form.Item>
      </Form>
    </Modal>
  )
}
