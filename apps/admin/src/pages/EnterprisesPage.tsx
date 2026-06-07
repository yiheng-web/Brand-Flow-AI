import { Button, Card, Input, Popconfirm, Progress, Select, Space, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchEnterprises, updateEnterpriseStatus } from '../api/enterprises'
import { StatusTag } from '../components/StatusTag'
import type { ListQuery, ManagedEnterprise } from '../types/admin'

export function EnterprisesPage() {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()
  const [enterprises, setEnterprises] = useState<ManagedEnterprise[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: 10 })

  const loadEnterprises = async (nextQuery = query) => {
    setLoading(true)
    try {
      const result = await fetchEnterprises(nextQuery)
      setEnterprises(result.items)
      setTotal(result.total)
    } catch {
      messageApi.error('企业列表加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEnterprises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            onConfirm={async () => {
              await updateEnterpriseStatus(record.id, 'disabled')
              messageApi.success('企业已禁用')
              await loadEnterprises()
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
        <h1 className="page-title">企业管理</h1>
        <p className="page-description">查看平台企业、团队数量、成员数量和状态。</p>
      </div>
      <Card>
        <div className="toolbar">
          <div className="toolbar-filters">
            <Input.Search
              placeholder="搜索企业名称"
              style={{ maxWidth: 280 }}
              onSearch={(keyword) => {
                const nextQuery = { ...query, page: 1, keyword }
                setQuery(nextQuery)
                void loadEnterprises(nextQuery)
              }}
            />
            <Select
              placeholder="状态"
              allowClear
              style={{ width: 160 }}
              onChange={(status) => {
                const nextQuery = { ...query, page: 1, status }
                setQuery(nextQuery)
                void loadEnterprises(nextQuery)
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
          dataSource={enterprises}
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total,
            onChange: (page, pageSize) => {
              const nextQuery = { ...query, page, pageSize }
              setQuery(nextQuery)
              void loadEnterprises(nextQuery)
            },
          }}
        />
      </Card>
    </>
  )
}
