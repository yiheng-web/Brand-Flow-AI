import { Card, DatePicker, Input, Select, Table, Tag, message } from 'antd'
import type { TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { fetchAuditLogs } from '../api/audit'
import type { AuditLog, ListQuery } from '../types/admin'

export function AuditLogsPage() {
  const [messageApi, contextHolder] = message.useMessage()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: 10 })

  const loadLogs = async (nextQuery = query) => {
    setLoading(true)
    try {
      const result = await fetchAuditLogs(nextQuery)
      setLogs(result.items)
      setTotal(result.total)
    } catch {
      messageApi.error('审计日志加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns: TableProps<AuditLog>['columns'] = [
    { title: '操作人', dataIndex: 'actor' },
    { title: '动作', dataIndex: 'action', render: (value) => <Tag>{value}</Tag> },
    { title: '对象类型', dataIndex: 'targetType' },
    { title: '对象名称', dataIndex: 'targetName' },
    { title: '时间', dataIndex: 'createdAt' },
  ]

  return (
    <>
      {contextHolder}
      <div className="page-header">
        <h1 className="page-title">审计日志</h1>
        <p className="page-description">追踪后台写操作和敏感操作记录。</p>
      </div>
      <Card>
        <div className="toolbar">
          <div className="toolbar-filters">
            <Input.Search
              placeholder="搜索操作人"
              style={{ maxWidth: 280 }}
              onSearch={(actor) => {
                const nextQuery = { ...query, page: 1, actor }
                setQuery(nextQuery)
                void loadLogs(nextQuery)
              }}
            />
            <Select
              placeholder="对象类型"
              allowClear
              style={{ width: 160 }}
              onChange={(targetType) => {
                const nextQuery = { ...query, page: 1, targetType }
                setQuery(nextQuery)
                void loadLogs(nextQuery)
              }}
              options={[
                { label: 'user', value: 'user' },
                { label: 'enterprise', value: 'enterprise' },
              ]}
            />
            <DatePicker.RangePicker disabled />
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total,
            onChange: (page, pageSize) => {
              const nextQuery = { ...query, page, pageSize }
              setQuery(nextQuery)
              void loadLogs(nextQuery)
            },
          }}
        />
      </Card>
    </>
  )
}
