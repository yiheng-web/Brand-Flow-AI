/**
 * 登录页面
 *
 * 功能说明：
 * - 企业邮箱 + 密码登录
 * - 表单校验（邮箱格式、密码长度）
 * - 调用 login API（当前 mock 模式，切换 USE_MOCK = false 后对接真实后端）
 * - 登录成功跳转 /home
 * - 底部提供"注册账号"链接跳转 /register
 */

import { useState } from 'react'
import { Button, Form, Input, message } from 'antd'
import { useNavigate, Link } from 'react-router-dom'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { login } from '@/api/auth'
import { useAuthStore } from '@/store/useAuthStore'
import styles from './login.module.css'

/** 登录表单字段类型 */
interface LoginFormValues {
  email: string
  password: string
}

const LoginPage = () => {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [submitting, setSubmitting] = useState(false)

  /** 表单提交：调用 login API，成功则写入 store 并跳转首页 */
  const handleFinish = async (values: LoginFormValues) => {
    setSubmitting(true)
    try {
      const res = await login({ email: values.email, password: values.password })
      if (res.success) {
        setAuth(res.data)
        message.success('登录成功')
        navigate('/home')
      }
    } catch {
      // 错误提示已在 apiClient 响应拦截器中统一处理
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.card}>
      {/* Logo */}
      <div className={styles.logoWrap}>
        <div className={styles.logoMark}>B</div>
      </div>

      {/* 标题 + 副标题 */}
      <h1 className={styles.title}>Brand-Flow AI</h1>
      <p className={styles.subtitle}>品牌级可控图文智能创作平台</p>

      {/* 登录表单 */}
      <Form<LoginFormValues>
        layout="vertical"
        initialValues={{ email: 'wang@hdu.edu.cn', password: '123456' }}
        onFinish={handleFinish}
        className={styles.form}
      >
        {/* 邮箱输入 */}
        <Form.Item
          name="email"
          rules={[
            { required: true, message: '请输入企业邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input
            prefix={<MailOutlined />}
            placeholder="企业邮箱"
            size="large"
            className={styles.input}
          />
        </Form.Item>

        {/* 密码输入 */}
        <Form.Item
          name="password"
          rules={[
            { required: true, message: '请输入密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="密码"
            size="large"
            className={styles.input}
          />
        </Form.Item>

        {/* 登录按钮 */}
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            block
            size="large"
            className={styles.submitButton}
          >
            登 录
          </Button>
        </Form.Item>

        {/* 底部切换：跳转到注册页 */}
        <div className={styles.switchRow}>
          还没有账号？
          <Link to="/register" className={styles.switchLink}>
            注册账号
          </Link>
        </div>
      </Form>
    </div>
  )
}

export default LoginPage
