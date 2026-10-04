import { Alert, Button, Descriptions, List, Space, Typography } from 'antd'
import type { FinalEvaluationResult } from '@brand-flow/contracts'

export default function QualityReport({
  report,
  onOptimize,
}: {
  report: FinalEvaluationResult
  onOptimize?: () => void
}) {
  return (
    <Space orientation="vertical">
      <Alert
        type={report.passed ? 'success' : 'warning'}
        showIcon
        title={report.passed ? '质检通过，可交付' : '质检未通过，当前结果不可交付'}
      />
      <Typography.Title level={4}>总分 {report.totalScore}</Typography.Title>
      <Descriptions
        column={1}
        items={[
          {
            key: 'brand',
            label: '品牌一致性',
            children: report.scores?.brandConsistency ?? '未记录',
          },
          {
            key: 'intent',
            label: '需求符合度',
            children: report.scores?.requirementAlignment ?? '未记录',
          },
          { key: 'composition', label: '构图', children: report.scores?.composition ?? '未记录' },
          {
            key: 'text',
            label: '可读性',
            children: report.scores?.textReadability ?? '纯图不适用',
          },
          { key: 'visual', label: '视觉质量', children: report.scores?.visualQuality ?? '未记录' },
        ]}
      />
      <List
        size="small"
        header="发现的问题"
        locale={{ emptyText: '未记录扣分问题' }}
        dataSource={report.deductions}
        renderItem={(item) => (
          <List.Item>
            {item.reason}（扣 {item.points} 分）
          </List.Item>
        )}
      />
      <List
        size="small"
        header="改进建议"
        locale={{ emptyText: '暂无改进建议' }}
        dataSource={report.suggestions}
        renderItem={(item) => <List.Item>{item}</List.Item>}
      />
      {onOptimize && <Button onClick={onOptimize}>继续优化</Button>}
    </Space>
  )
}
