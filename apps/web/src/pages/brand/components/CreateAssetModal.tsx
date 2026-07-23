import { useState } from 'react'
import { Modal, Form, Input, Select, message } from 'antd'

interface CreateAssetModalProps {
  open: boolean
  onClose: () => void
}

const ASSET_TYPES = [
  { label: '图片', value: 'image' },
  { label: '文档', value: 'document' },
  { label: '视频', value: 'video' },
  { label: '其他', value: 'other' },
]

const CreateAssetModal = ({ open, onClose }: CreateAssetModalProps) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      // TODO: POST /api/assets
      console.log('创建资产记录:', values)
      // const res = await api.createAsset(values)
      message.success('资产记录已创建')
      form.resetFields()
      onClose()
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="创建资产"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="name"
          label="资产名称"
          rules={[{ required: true, message: '请输入资产名称' }]}
        >
          <Input placeholder="请输入资产名称" maxLength={100} />
        </Form.Item>

        <Form.Item
          name="type"
          label="资产类型"
          rules={[{ required: true, message: '请选择资产类型' }]}
        >
          <Select placeholder="请选择资产类型" options={ASSET_TYPES} />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <Input.TextArea placeholder="可选描述" maxLength={500} rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateAssetModal
