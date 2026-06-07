import { Button, Card, Form, InputNumber, Switch, message } from 'antd'

export function SettingsPage() {
  const [messageApi, contextHolder] = message.useMessage()

  return (
    <>
      {contextHolder}
      <div className="page-header">
        <h1 className="page-title">系统配置</h1>
        <p className="page-description">配置平台级审核、额度和风控默认值。</p>
      </div>
      <Card>
        <Form
          layout="vertical"
          initialValues={{
            enableReview: true,
            defaultMonthlyQuota: 10000,
            enableAuditLog: true,
          }}
          onFinish={() => messageApi.success('系统配置已保存')}
        >
          <Form.Item label="启用平台审核队列" name="enableReview" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="默认企业月度额度" name="defaultMonthlyQuota">
            <InputNumber min={0} style={{ width: 240 }} />
          </Form.Item>
          <Form.Item label="启用审计日志" name="enableAuditLog" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存配置
          </Button>
        </Form>
      </Card>
    </>
  )
}
