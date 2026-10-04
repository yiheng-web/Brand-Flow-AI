import { Button, Result, Space } from 'antd'
import { useNavigate } from 'react-router-dom'

export default function RouteError() {
  const navigate = useNavigate()
  return (
    <Result
      status="error"
      title="页面暂时无法显示"
      subTitle="已保存的任务不会丢失，请重新打开页面或从任务历史继续。"
      extra={
        <Space>
          <Button onClick={() => window.location.reload()}>重新加载</Button>
          <Button onClick={() => navigate('/tasks')}>返回任务历史</Button>
        </Space>
      }
    />
  )
}
