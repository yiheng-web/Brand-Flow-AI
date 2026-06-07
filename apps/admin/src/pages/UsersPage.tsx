import { Button, Card, Input, Popconfirm, Select, Space, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { usersFixture } from '../api/users'
import { StatusTag } from '../components/StatusTag'
import type { ManagedUser } from '../types/admin'

export function UsersPage() {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()

  const columns: TableProps<ManagedUser>['columns'] = [
    { title: '邮箱', dataIndex: 'email' },
    { title: '昵称', dataIndex: 'nickname' },
    { title: '角色', dataIndex: 'role' },
    { title: '状态', dataIndex: 'status', render: (status) => <StatusTag status={status} /> },
    { title: '创建时间', dataIndex: 'createdAt' },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => navigate(`/users/${record.id}`)}>
            详情
          </Button>
          <Popconfirm
            title="确认禁用该用户？"
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
        <h1 className="page-title">用户管理</h1>
        <p className="page-description">查询、筛选和处理平台用户状态。</p>
      </div>
      <Card>
        <div className="toolbar">
          <div className="toolbar-filters">
            <Input.Search placeholder="搜索邮箱或昵称" style={{ maxWidth: 280 }} />
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
          dataSource={usersFixture}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </>
  )
}
