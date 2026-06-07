import { Card, Descriptions } from 'antd'
import { useParams } from 'react-router-dom'
import { usersFixture } from '../api/users'
import { StatusTag } from '../components/StatusTag'

export function UserDetailPage() {
  const { userId } = useParams()
  const user = usersFixture.find((item) => item.id === userId) ?? usersFixture[0]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">用户详情</h1>
        <p className="page-description">查看用户基础信息、状态和角色。</p>
      </div>
      <Card>
        <Descriptions bordered column={1}>
          <Descriptions.Item label="用户 ID">{user.id}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{user.email}</Descriptions.Item>
          <Descriptions.Item label="昵称">{user.nickname}</Descriptions.Item>
          <Descriptions.Item label="角色">{user.role}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <StatusTag status={user.status} />
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{user.createdAt}</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  )
}
