import type { ReviewItem } from '../types/admin'

export const reviewQueueFixture: ReviewItem[] = [
  {
    id: 'review_1001',
    title: '夏日冰咖啡产品图',
    type: 'asset',
    enterpriseName: '瑞幸咖啡',
    submitter: 'creator@example.com',
    status: 'pending_review',
    createdAt: '2026-06-07',
  },
  {
    id: 'review_1002',
    title: '招生海报 Prompt 模板',
    type: 'knowledge',
    enterpriseName: '高校招生中心',
    submitter: 'brand@example.com',
    status: 'pending_review',
    createdAt: '2026-06-07',
  },
]
