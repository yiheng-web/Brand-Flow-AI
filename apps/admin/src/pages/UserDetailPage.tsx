import { Alert, Card, Descriptions, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchUser } from '../api/users'
import { StatusTag } from '../components/StatusTag'
import type { ManagedUser } from '../types/admin'

export function UserDetailPage() {
  const { userId } = useParams()
  const [user, setUser] = useState<ManagedUser>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return

    fetchUser(userId)
      .then(setUser)
      .catch(() => setError('用户详情加载失败'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return <Spin />
  }

  if (error || !user) {
    return <Alert type="error" message={error || '用户不存在'} />
  }

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
