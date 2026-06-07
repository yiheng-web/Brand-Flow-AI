import { Alert, Card, Descriptions, Spin, Tabs, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchEnterprise, fetchEnterpriseMembers, fetchEnterpriseTeams } from '../api/enterprises'
import { StatusTag } from '../components/StatusTag'
import type { ManagedEnterprise, ManagedTeam, ManagedUser } from '../types/admin'

export function EnterpriseDetailPage() {
  const { enterpriseId } = useParams()
  const [enterprise, setEnterprise] = useState<ManagedEnterprise>()
  const [members, setMembers] = useState<ManagedUser[]>([])
  const [teams, setTeams] = useState<ManagedTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enterpriseId) return

    Promise.all([
      fetchEnterprise(enterpriseId),
      fetchEnterpriseMembers(enterpriseId, { page: 1, pageSize: 10 }),
      fetchEnterpriseTeams(enterpriseId, { page: 1, pageSize: 10 }),
    ])
      .then(([enterpriseResult, membersResult, teamsResult]) => {
        setEnterprise(enterpriseResult)
        setMembers(membersResult.items)
        setTeams(teamsResult.items)
      })
      .catch(() => setError('企业详情加载失败'))
      .finally(() => setLoading(false))
  }, [enterpriseId])

  if (loading) {
    return <Spin />
  }

  if (error || !enterprise) {
    return <Alert type="error" message={error || '企业不存在'} />
  }

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
                  dataSource={members}
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
                  dataSource={teams}
                  pagination={{ pageSize: 5 }}
                  columns={[
                    { title: '团队名称', dataIndex: 'name' },
                    { title: '描述', dataIndex: 'description' },
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
