import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'

interface LoginFormValues {
  email: string
  password: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [messageApi, contextHolder] = message.useMessage()

  const handleFinish = async (values: LoginFormValues) => {
    try {
      await login(values.email, values.password)
      navigate('/dashboard')
    } catch {
      messageApi.error('登录失败，请检查后台账号或 API 服务')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#f5f7fb',
      }}
    >
      {contextHolder}
      <Card style={{ width: 400, maxWidth: '100%' }}>
        <div style={{ marginBottom: 24 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Brand-Flow Admin
          </Typography.Title>
          <Typography.Text type="secondary">平台运营后台</Typography.Text>
        </div>
        <Form<LoginFormValues>
          layout="vertical"
          initialValues={{ email: 'demo@brand-flow.ai', password: 'demo123456' }}
          onFinish={handleFinish}
        >
          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
