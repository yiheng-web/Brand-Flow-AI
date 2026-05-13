import { useState } from 'react'
import { Button, Form, Input } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import styles from './login.module.css'

interface LoginFormValues {
  email: string
  password: string
}

const LoginPage = () => {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [submitting, setSubmitting] = useState(false)

  const handleFinish = (values: LoginFormValues) => {
    setSubmitting(true)
    login(values.email)

    window.setTimeout(() => {
      setSubmitting(false)
      navigate('/home')
    }, 300)
  }

  return (
    <div className={styles.card}>
      <div className={styles.logoWrap}>
        <div className={styles.logoMark}>🤖</div>
      </div>

      <h1 className={styles.title}>Brand-Flow AI</h1>
      <p className={styles.subtitle}>品牌级可控图文智能创作平台</p>

      <Form<LoginFormValues>
        layout="vertical"
        initialValues={{
          email: 'wang@hdu.edu.cn',
          password: '123456',
        }}
        onFinish={handleFinish}
        className={styles.form}
      >
        <Form.Item
          name="email"
          rules={[{ required: true, message: '请输入企业邮箱或账号' }]}
          className={styles.formItem}
        >
          <Input placeholder="企业邮箱 / 账号" className={styles.input} />
        </Form.Item>

        <Form.Item
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
          className={styles.formItem}
        >
          <Input.Password placeholder="密码" className={styles.input} />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={submitting} block className={styles.submitButton}>
            登 录
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}

export default LoginPage