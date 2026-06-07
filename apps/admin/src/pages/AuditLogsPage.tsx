import { Card, DatePicker, Input, Select, Table, Tag } from 'antd'
import type { TableProps } from 'antd'
import { auditLogsFixture } from '../api/audit'
import type { AuditLog } from '../types/admin'

export function AuditLogsPage() {
  const columns: TableProps<AuditLog>['columns'] = [
    { title: '操作人', dataIndex: 'actor' },
    { title: '动作', dataIndex: 'action', render: (value) => <Tag>{value}</Tag> },
    { title: '对象类型', dataIndex: 'targetType' },
    { title: '对象名称', dataIndex: 'targetName' },
    { title: '时间', dataIndex: 'createdAt' },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">审计日志</h1>
        <p className="page-description">追踪后台写操作和敏感操作记录。</p>
      </div>
      <Card>
        <div className="toolbar">
          <div className="toolbar-filters">
            <Input.Search placeholder="搜索操作人或对象" style={{ maxWidth: 280 }} />
            <Select
              placeholder="对象类型"
              allowClear
              style={{ width: 160 }}
              options={[
                { label: 'user', value: 'user' },
                { label: 'enterprise', value: 'enterprise' },
              ]}
            />
            <DatePicker.RangePicker />
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={auditLogsFixture}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </>
  )
}
