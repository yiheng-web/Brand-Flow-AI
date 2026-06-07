import { Button, Card, Input, Modal, Select, Space, Table, message } from 'antd'
import type { TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { approveReviewItem, fetchReviewQueue, rejectReviewItem } from '../api/review'
import { StatusTag } from '../components/StatusTag'
import type { ListQuery, ReviewItem } from '../types/admin'

export function ReviewQueuePage() {
  const [messageApi, contextHolder] = message.useMessage()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: 10 })

  const loadQueue = async (nextQuery = query) => {
    setLoading(true)
    try {
      const result = await fetchReviewQueue(nextQuery)
      setItems(result.items)
      setTotal(result.total)
    } catch {
      messageApi.error('审核队列加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQueue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns: TableProps<ReviewItem>['columns'] = [
    { title: '标题', dataIndex: 'title' },
    { title: '类型', dataIndex: 'type' },
    { title: '企业', dataIndex: 'enterpriseName' },
    { title: '提交人', dataIndex: 'submitter' },
    { title: '状态', dataIndex: 'status', render: (status) => <StatusTag status={status} /> },
    { title: '提交时间', dataIndex: 'createdAt' },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={async () => {
              await approveReviewItem(record.id)
              messageApi.success('已通过审核')
              await loadQueue()
            }}
          >
            通过
          </Button>
          <Button
            danger
            type="link"
            onClick={() =>
              Modal.confirm({
                title: '拒绝审核',
                content: (
                  <Input.TextArea id="review-reject-reason" placeholder="填写拒绝原因" rows={4} />
                ),
                onOk: async () => {
                  const reason =
                    document.querySelector<HTMLTextAreaElement>('#review-reject-reason')?.value ??
                    ''
                  await rejectReviewItem(record.id, reason)
                  messageApi.success('已拒绝审核')
                  await loadQueue()
                },
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
            <Input.Search
              placeholder="搜索标题"
              style={{ maxWidth: 280 }}
              onSearch={(keyword) => {
                const nextQuery = { ...query, page: 1, keyword }
                setQuery(nextQuery)
                void loadQueue(nextQuery)
              }}
            />
            <Select
              placeholder="类型"
              allowClear
              disabled
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
          dataSource={items}
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total,
            onChange: (page, pageSize) => {
              const nextQuery = { ...query, page, pageSize }
              setQuery(nextQuery)
              void loadQueue(nextQuery)
            },
          }}
        />
      </Card>
    </>
  )
}
