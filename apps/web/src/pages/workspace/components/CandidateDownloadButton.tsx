import { useState } from 'react'
import { Button, Space, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { getCandidateDownload } from '@/api/workflow'

export default function CandidateDownloadButton({
  workflowId,
  candidateId,
}: {
  workflowId: string
  candidateId: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const handleDownload = async () => {
    if (loading) return
    setLoading(true)
    setError(false)
    try {
      const download = await getCandidateDownload(workflowId, candidateId)
      const link = document.createElement('a')
      link.href = download.downloadUrl
      link.download = download.fileName
      link.click()
    } catch {
      // 接口拦截器显示失败原因，保留当前操作的重试入口。
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  return (
    <Space orientation="vertical">
      <Button
        aria-label="下载当前候选"
        icon={<DownloadOutlined aria-hidden />}
        loading={loading}
        onClick={() => void handleDownload()}
      >
        下载当前候选
      </Button>
      {error && <Typography.Text type="danger">下载失败，请重试</Typography.Text>}
    </Space>
  )
}
