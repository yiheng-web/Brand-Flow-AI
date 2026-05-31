/**
 * 注册页面
 *
 * 功能说明：
 * - 姓名 + 邮箱 + 密码 + 确认密码
 * - 表单校验（邮箱格式、密码强度、两次密码一致）
 * - 调用 register API
 * - 注册成功跳转到登录页让用户手动登录
 * - 底部提供"已有账号？去登录"链接
 */

import { useState } from 'react'
import { Button, Form, Input, message } from 'antd'
import { useNavigate, Link } from 'react-router-dom'
import { UserOutlined, MailOutlined, LockOutlined } from '@ant-design/icons'
import { register } from '@/api/auth'
import styles from './login.module.css'

/** 注册表单字段类型 */
interface RegisterFormValues {
  name: string
  email: string
  password: string
  confirmPassword: string
}

const RegisterPage = () => {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  /** 表单提交：调用 register API，成功则跳转到登录页 */
  const handleFinish = async (values: RegisterFormValues) => {
    setSubmitting(true)
    try {
      await register({
        name: values.name,
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword,
      })
      message.success('注册成功，请登录')
      navigate('/login')
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
      <h1 className={styles.title}>创建账号</h1>
      <p className={styles.subtitle}>加入 Brand-Flow AI 开启智能创作</p>

      {/* 注册表单 */}
      <Form<RegisterFormValues>
        layout="vertical"
        onFinish={handleFinish}
        className={styles.form}
      >
        {/* 姓名输入 */}
        <Form.Item
          name="name"
          rules={[
            { required: true, message: '请输入姓名' },
            { min: 2, message: '姓名至少 2 个字符' },
          ]}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder="姓名"
            size="large"
            className={styles.input}
          />
        </Form.Item>

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
            { required: true, message: '请设置密码' },
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

        {/* 确认密码：需与 password 字段值一致 */}
        <Form.Item
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: '请确认密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('两次输入的密码不一致'))
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="确认密码"
            size="large"
            className={styles.input}
          />
        </Form.Item>

        {/* 注册按钮 */}
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            block
            size="large"
            className={styles.submitButton}
          >
            注 册
          </Button>
        </Form.Item>

        {/* 底部切换：跳转到登录页 */}
        <div className={styles.switchRow}>
          已有账号？
          <Link to="/login" className={styles.switchLink}>去登录</Link>
        </div>
      </Form>
    </div>
  )
}

export default RegisterPage