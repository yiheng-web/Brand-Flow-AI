import { Button, Card, Input, Popconfirm, Progress, Select, Space, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { enterprisesFixture } from '../api/enterprises'
import { StatusTag } from '../components/StatusTag'
import type { ManagedEnterprise } from '../types/admin'

export function EnterprisesPage() {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()

  const columns: TableProps<ManagedEnterprise>['columns'] = [
    { title: '企业名称', dataIndex: 'name' },
    { title: '成员数', dataIndex: 'members' },
    { title: '团队数', dataIndex: 'teams' },
    {
      title: '额度消耗',
      dataIndex: 'quotaUsed',
      render: (value) => <Progress percent={value} size="small" />,
    },
    { title: '状态', dataIndex: 'status', render: (status) => <StatusTag status={status} /> },
    { title: '创建时间', dataIndex: 'createdAt' },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => navigate(`/enterprises/${record.id}`)}>
            详情
          </Button>
          <Popconfirm
            title="确认禁用该企业？"
            onConfirm={() => messageApi.success('已提交禁用操作')}
          >
            <Button danger type="link" disabled={record.status === 'disabled'}>
              禁用
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      <div className="page-header">
        <h1 className="page-title">企业管理</h1>
        <p className="page-description">查看平台企业、团队数量、成员数量和状态。</p>
      </div>
      <Card>
        <div className="toolbar">
          <div className="toolbar-filters">
            <Input.Search placeholder="搜索企业名称" style={{ maxWidth: 280 }} />
            <Select
              placeholder="状态"
              allowClear
              style={{ width: 160 }}
              options={[
                { label: 'active', value: 'active' },
                { label: 'disabled', value: 'disabled' },
              ]}
            />
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={enterprisesFixture}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </>
  )
}
