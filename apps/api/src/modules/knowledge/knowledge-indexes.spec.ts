import type { Model } from 'mongoose'
import { migrateKnowledgeIndexes } from './knowledge-indexes'
import type { KnowledgeDocument } from './schemas/knowledge.schema'

describe('知识库索引迁移', () => {
  function fixture() {
    const order: string[] = []
    const model = {
      createCollection: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue(undefined),
      countDocuments: jest.fn().mockResolvedValue(0),
      createIndexes: jest.fn(async () => {
        order.push('create')
      }),
      collection: {
        indexes: jest.fn().mockResolvedValue([
          { name: 'spaceId_1_name_1', key: { spaceId: 1, name: 1 }, unique: true },
          { name: 'custom', key: { spaceId: 1, name: 1 }, unique: true },
        ]),
        dropIndex: jest.fn(async () => {
          order.push('drop')
        }),
      },
    }
    return { model, order }
  }

  it('先建立新保护，再只删除确认过的旧唯一索引', async () => {
    const { model, order } = fixture()
    await migrateKnowledgeIndexes(model as unknown as Model<KnowledgeDocument>)
    expect(order).toEqual(['create', 'drop'])
    expect(model.collection.dropIndex).toHaveBeenCalledTimes(1)
    expect(model.collection.dropIndex).toHaveBeenCalledWith('spaceId_1_name_1')
  })

  it('新索引失败时保留旧索引', async () => {
    const { model } = fixture()
    model.createIndexes.mockRejectedValueOnce(new Error('duplicate'))
    await expect(
      migrateKnowledgeIndexes(model as unknown as Model<KnowledgeDocument>),
    ).rejects.toThrow('duplicate')
    expect(model.collection.dropIndex).not.toHaveBeenCalled()
  })

  it('不允许缺少归属的数据脱离唯一性保护', async () => {
    const { model } = fixture()
    model.countDocuments.mockResolvedValueOnce(1)
    await expect(
      migrateKnowledgeIndexes(model as unknown as Model<KnowledgeDocument>),
    ).rejects.toThrow('补齐归属')
    expect(model.createIndexes).not.toHaveBeenCalled()
  })
})
