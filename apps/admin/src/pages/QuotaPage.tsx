import { Button, Card, Input, Modal, Progress, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { quotaFixture } from '../api/quota'
import type { ManagedEnterprise } from '../types/admin'

export function QuotaPage() {
  const [messageApi, contextHolder] = message.useMessage()

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
          dataSource={quotaFixture}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </>
  )
}
