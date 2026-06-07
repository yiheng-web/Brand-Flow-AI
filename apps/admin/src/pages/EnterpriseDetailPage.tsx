import { Card, Descriptions, Tabs, Table } from 'antd'
import { useParams } from 'react-router-dom'
import { enterprisesFixture } from '../api/enterprises'
import { usersFixture } from '../api/users'
import { StatusTag } from '../components/StatusTag'

export function EnterpriseDetailPage() {
  const { enterpriseId } = useParams()
  const enterprise =
    enterprisesFixture.find((item) => item.id === enterpriseId) ?? enterprisesFixture[0]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">企业详情</h1>
        <p className="page-description">查看企业信息、成员和团队概况。</p>
      </div>
      <Tabs
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <Card>
                <Descriptions bordered column={1}>
                  <Descriptions.Item label="企业 ID">{enterprise.id}</Descriptions.Item>
                  <Descriptions.Item label="企业名称">{enterprise.name}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <StatusTag status={enterprise.status} />
                  </Descriptions.Item>
                  <Descriptions.Item label="成员数">{enterprise.members}</Descriptions.Item>
                  <Descriptions.Item label="团队数">{enterprise.teams}</Descriptions.Item>
                  <Descriptions.Item label="额度消耗">{enterprise.quotaUsed}%</Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'members',
            label: '企业成员',
            children: (
              <Card>
                <Table
                  rowKey="id"
                  dataSource={usersFixture}
                  pagination={{ pageSize: 5 }}
                  columns={[
                    { title: '邮箱', dataIndex: 'email' },
                    { title: '昵称', dataIndex: 'nickname' },
                    { title: '角色', dataIndex: 'role' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (status) => <StatusTag status={status} />,
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'teams',
            label: '企业团队',
            children: (
              <Card>
                <Table
                  rowKey="id"
                  dataSource={[
                    { id: 'team_1', name: '新品项目组', members: 16, status: 'active' },
                    { id: 'team_2', name: '电商运营组', members: 12, status: 'active' },
                  ]}
                  pagination={false}
                  columns={[
                    { title: '团队名称', dataIndex: 'name' },
                    { title: '成员数', dataIndex: 'members' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (status) => <StatusTag status={status} />,
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />
    </>
  )
}
