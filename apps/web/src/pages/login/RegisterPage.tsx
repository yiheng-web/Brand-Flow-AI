import { Button, Form, Input, message } from 'antd'
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'

import styles from './login.module.css'

interface RegisterFormValues {
  name: string
  email: string
  password: string
}

export function RegisterPage() {
  const navigate = useNavigate()

  const handleFinish = () => {
    message.success('注册成功，请登录')
    navigate('/login')
  }

  return (
    <div className={styles.card}>
      <div className={styles.logoWrap}>
        <div className={styles.logoMark}>B</div>
      </div>
      <h1 className={styles.title}>创建账号</h1>
      <p className={styles.subtitle}>加入 Brand-Flow AI 开启智能创作</p>
      <Form<RegisterFormValues> className={styles.form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]}>
          <Input
            className={styles.input}
            prefix={<UserOutlined />}
            placeholder="姓名"
            size="large"
          />
        </Form.Item>
        <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
          <Input
            className={styles.input}
            prefix={<MailOutlined />}
            placeholder="邮箱"
            size="large"
          />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password
            className={styles.input}
            prefix={<LockOutlined />}
            placeholder="密码"
            size="large"
          />
        </Form.Item>
        <Form.Item>
          <Button
            block
            className={styles.submitButton}
            htmlType="submit"
            size="large"
            type="primary"
          >
            注册
          </Button>
        </Form.Item>
        <div className={styles.switchRow}>
          已有账号？
          <Link className={styles.switchLink} to="/login">
            去登录
          </Link>
        </div>
      </Form>
    </div>
  )
}
