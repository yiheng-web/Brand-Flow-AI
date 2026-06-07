import {
  BankOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Alert, Card, Col, Row, Spin, Statistic, Table, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { fetchDashboard } from '../api/dashboard'
import type { DashboardSummary } from '../types/admin'

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDashboard()
      .then(setSummary)
      .catch(() => setError('Dashboard 数据加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Spin />
  }

  if (error || !summary) {
    return <Alert type="error" message={error || 'Dashboard 数据不存在'} />
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">查看平台用户、企业、额度和审核概况。</p>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="用户总数" value={summary.users} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="企业总数" value={summary.enterprises} prefix={<BankOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日生成"
              value={summary.generationsToday}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="待审核"
              value={summary.pendingReviews}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Card title="近期审计日志" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          size="middle"
          dataSource={summary.recentAuditLogs ?? []}
          pagination={false}
          columns={[
            { title: '操作人', dataIndex: 'actor' },
            { title: '动作', dataIndex: 'action', render: (value) => <Tag>{value}</Tag> },
            { title: '对象', dataIndex: 'targetName' },
            { title: '时间', dataIndex: 'createdAt' },
          ]}
        />
      </Card>
    </>
  )
}
