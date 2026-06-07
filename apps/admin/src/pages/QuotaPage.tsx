import { Button, Card, Input, Modal, Progress, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { fetchQuotaUsage } from '../api/quota'
import type { ListQuery, ManagedEnterprise } from '../types/admin'

export function QuotaPage() {
  const [messageApi, contextHolder] = message.useMessage()
  const [items, setItems] = useState<ManagedEnterprise[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: 10 })

  const loadQuota = async (nextQuery = query) => {
    setLoading(true)
    try {
      const result = await fetchQuotaUsage(nextQuery)
      setItems(result.items)
      setTotal(result.total)
    } catch {
      messageApi.error('额度数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQuota()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns: TableProps<ManagedEnterprise>['columns'] = [
    { title: '企业', dataIndex: 'name' },
    { title: '成员数', dataIndex: 'members' },
    { title: '团队数', dataIndex: 'teams' },
    {
      title: '额度消耗',
      dataIndex: 'quotaUsed',
      render: (value) => <Progress percent={value} size="small" />,
    },
    {
      title: '操作',
      render: () => (
        <Button
          type="link"
          onClick={() =>
            Modal.confirm({
              title: '调整企业额度',
              content: <Input placeholder="输入新的月度额度" />,
              onOk: () => messageApi.success('额度调整已提交'),
            })
          }
        >
          调整额度
        </Button>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      <div className="page-header">
        <h1 className="page-title">额度管理</h1>
        <p className="page-description">查看企业额度消耗，并处理额度调整。</p>
      </div>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total,
            onChange: (page, pageSize) => {
              const nextQuery = { ...query, page, pageSize }
              setQuery(nextQuery)
              void loadQuota(nextQuery)
            },
          }}
        />
      </Card>
    </>
  )
}
