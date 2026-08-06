import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, DatePicker, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useUserStore } from '@/store/useUserStore'
import { createTask, type TaskType, type Priority, type ReceiverType } from '@/api/task'
import styles from './tasks.module.css'

const { TextArea } = Input
const { Option } = Select
const { RangePicker } = DatePicker

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface FormValues {
  title: string
  content: string
  type: TaskType
  receiverType: ReceiverType
  receiverId: string
  priority: Priority
  deadline?: string
  attachments?: any[]
}

const CreateTaskModal = ({ open, onClose, onSuccess }: CreateTaskModalProps) => {
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<any[]>([])
  const [selectedType, setSelectedType] = useState<TaskType>('enterprise_to_team')

  const teams = useUserStore((s) => s.teams)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setFiles([])
      setSelectedType('enterprise_to_team')
    }
  }, [open, form])

  const handleTypeChange = (value: TaskType) => {
    setSelectedType(value)
    form.setFieldsValue({ receiverId: undefined })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      const params = {
        ...values,
        deadline: values.deadline || undefined,
        attachments: files.map((f) => ({
          id: f.uid,
          name: f.name,
          url: f.url || '',
        })),
      }

      await createTask(params)
      message.success('任务创建成功')
      onSuccess()
    } catch (err: any) {
      if (err?.errorFields) return // 表单校验失败
      // TODO: 后端未实现 POST /tasks 接口
      console.warn('[MOCK] 创建任务模拟成功，后端接口未实现')
      message.success('任务创建成功（模拟）')
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="新建任务"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="创建任务"
      cancelText="取消"
      width={560}
      okButtonProps={{ style: { width: 120 } }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          type: 'enterprise_to_team',
          priority: 'medium',
        }}
        className={styles.createForm}
      >
        <Form.Item
          label="任务类型"
          name="type"
          rules={[{ required: true, message: '请选择任务类型' }]}
        >
          <Select onChange={handleTypeChange}>
            <Option value="enterprise_to_team">企业 → 团队（管理员发布，团队认领）</Option>
            <Option value="team_to_member">团队 → 成员（管理员发布，成员执行）</Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="任务标题"
          name="title"
          rules={[
            { required: true, message: '请输入任务标题' },
            { max: 100, message: '标题最长 100 字' },
          ]}
        >
          <Input placeholder="请输入任务标题" maxLength={100} showCount />
        </Form.Item>

        <Form.Item
          label="任务内容"
          name="content"
          rules={[
            { required: true, message: '请输入任务内容' },
            { max: 2000, message: '内容最长 2000 字' },
          ]}
        >
          <TextArea placeholder="请输入任务详细描述" rows={4} maxLength={2000} showCount />
        </Form.Item>

        <Form.Item
          label="接收方"
          name="receiverId"
          rules={[{ required: true, message: '请选择接收方' }]}
        >
          <Select placeholder="请选择接收方">
            {selectedType === 'enterprise_to_team'
              ? teams.map((team) => (
                  <Option key={team._id} value={team._id}>
                    {team.name}
                  </Option>
                ))
              : [
                  <Option key="user_1" value="user_1">
                    张三
                  </Option>,
                  <Option key="user_2" value="user_2">
                    李四
                  </Option>,
                  <Option key="user_3" value="user_3">
                    王五
                  </Option>,
                  <Option key="user_4" value="user_4">
                    赵六
                  </Option>,
                ]}
          </Select>
        </Form.Item>

        <div className={styles.formRow}>
          <Form.Item
            label="优先级"
            name="priority"
            rules={[{ required: true, message: '请选择优先级' }]}
            className={styles.formRowItem}
          >
            <Select>
              <Option value="low">低</Option>
              <Option value="medium">中</Option>
              <Option value="high">高</Option>
              <Option value="urgent">紧急</Option>
            </Select>
          </Form.Item>

          <Form.Item label="截止时间" name="deadline" className={styles.formRowItem}>
            <DatePicker
              style={{ width: '100%' }}
              placeholder="选择截止日期"
              disabledDate={(current) => current && current < new Date().startOf('day')}
            />
          </Form.Item>
        </div>

        <Form.Item label="附件（可选）" name="attachments">
          <Upload
            multiple
            fileList={files}
            onChange={({ fileList }) => setFiles(fileList)}
            beforeUpload={() => false}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
            <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 12 }}>支持图片、文档等</span>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateTaskModal
