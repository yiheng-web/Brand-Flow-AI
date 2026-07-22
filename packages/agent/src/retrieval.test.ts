import assert from 'node:assert/strict'
import test from 'node:test'

import { ingestDocument, searchKnowledge } from './retrieval'

test('禁用向量模式时知识项入库明确返回 skipped', async () => {
  const previous = process.env.KNOWLEDGE_VECTOR_MODE
  process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'

  try {
    const result = await ingestDocument('品牌主色为蓝色', {
      enterpriseId: 'enterprise-1',
      knowledgeId: 'knowledge-1',
    })
    assert.deepEqual(result, {
      success: true,
      chunks: 0,
      vectorized: false,
      skipped: true,
      reason: 'KNOWLEDGE_VECTOR_MODE=disabled',
    })
    await assert.rejects(
      searchKnowledge('品牌主色', {
        enterpriseId: 'enterprise-1',
        knowledgeId: 'knowledge-1',
      }),
      /向量检索已禁用/,
    )
  } finally {
    if (previous === undefined) delete process.env.KNOWLEDGE_VECTOR_MODE
    else process.env.KNOWLEDGE_VECTOR_MODE = previous
  }
})
