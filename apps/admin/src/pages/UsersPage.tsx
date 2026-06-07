import { Button, Card, Input, Popconfirm, Select, Space, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchUsers, updateUserStatus } from '../api/users'
import { StatusTag } from '../components/StatusTag'
import type { ListQuery, ManagedUser } from '../types/admin'

export function UsersPage() {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: 10 })

  const loadUsers = async (nextQuery = query) => {
    setLoading(true)
    try {
      const result = await fetchUsers(nextQuery)
      setUsers(result.items)
      setTotal(result.total)
    } catch {
      messageApi.error('用户列表加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            onConfirm={async () => {
              await updateUserStatus(record.id, 'disabled')
              messageApi.success('用户已禁用')
              await loadUsers()
            }}
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
            <Input.Search
              placeholder="搜索邮箱或昵称"
              style={{ maxWidth: 280 }}
              onSearch={(keyword) => {
                const nextQuery = { ...query, page: 1, keyword }
                setQuery(nextQuery)
                void loadUsers(nextQuery)
              }}
            />
            <Select
              placeholder="状态"
              allowClear
              style={{ width: 160 }}
              onChange={(status) => {
                const nextQuery = { ...query, page: 1, status }
                setQuery(nextQuery)
                void loadUsers(nextQuery)
              }}
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
          dataSource={users}
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total,
            onChange: (page, pageSize) => {
              const nextQuery = { ...query, page, pageSize }
              setQuery(nextQuery)
              void loadUsers(nextQuery)
            },
          }}
        />
      </Card>
    </>
  )
}
