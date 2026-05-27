import { Button, Form, Input, message } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'

import { useAuthStore } from '@/store/useAuthStore'

import styles from './login.module.css'

interface LoginFormValues {
  email: string
  password: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const handleFinish = (values: LoginFormValues) => {
    login('demo-token', {
      id: 'demo-user',
      name: '王同学',
      email: values.email,
    })
    message.success('登录成功')
    navigate('/home')
  }

  return (
    <div className={styles.card}>
      <div className={styles.logoWrap}>
        <div className={styles.logoMark}>B</div>
      </div>
      <h1 className={styles.title}>Brand-Flow AI</h1>
      <p className={styles.subtitle}>品牌级可控图文智能创作平台</p>
      <Form<LoginFormValues>
        className={styles.form}
        initialValues={{ email: 'wang@hdu.edu.cn', password: '123456' }}
        layout="vertical"
        onFinish={handleFinish}
      >
        <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
          <Input className={styles.input} prefix={<MailOutlined />} size="large" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password className={styles.input} prefix={<LockOutlined />} size="large" />
        </Form.Item>
        <Form.Item>
          <Button
            block
            className={styles.submitButton}
            htmlType="submit"
            size="large"
            type="primary"
          >
            登录
          </Button>
        </Form.Item>
        <div className={styles.switchRow}>
          还没有账号？
          <Link className={styles.switchLink} to="/register">
            注册账号
          </Link>
        </div>
      </Form>
    </div>
  )
}
