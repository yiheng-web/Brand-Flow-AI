import { Button, Card, Input, Modal, Select, Space, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { reviewQueueFixture } from '../api/review'
import { StatusTag } from '../components/StatusTag'
import type { ReviewItem } from '../types/admin'

export function ReviewQueuePage() {
  const [messageApi, contextHolder] = message.useMessage()

  const columns: TableProps<ReviewItem>['columns'] = [
    { title: '标题', dataIndex: 'title' },
    { title: '类型', dataIndex: 'type' },
    { title: '企业', dataIndex: 'enterpriseName' },
    { title: '提交人', dataIndex: 'submitter' },
    { title: '状态', dataIndex: 'status', render: (status) => <StatusTag status={status} /> },
    { title: '提交时间', dataIndex: 'createdAt' },
    {
      title: '操作',
      render: () => (
        <Space>
          <Button type="link" onClick={() => messageApi.success('已通过审核')}>
            通过
          </Button>
          <Button
            danger
            type="link"
            onClick={() =>
              Modal.confirm({
                title: '拒绝审核',
                content: <Input.TextArea placeholder="填写拒绝原因" rows={4} />,
                onOk: () => messageApi.success('已拒绝审核'),
              })
            }
          >
            拒绝
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      <div className="page-header">
        <h1 className="page-title">审核队列</h1>
        <p className="page-description">聚合查看平台待审核知识项和素材。</p>
      </div>
      <Card>
        <div className="toolbar">
          <div className="toolbar-filters">
            <Input.Search placeholder="搜索标题" style={{ maxWidth: 280 }} />
            <Select
              placeholder="类型"
              allowClear
              style={{ width: 160 }}
              options={[
                { label: 'knowledge', value: 'knowledge' },
                { label: 'asset', value: 'asset' },
              ]}
            />
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={reviewQueueFixture}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </>
  )
}
