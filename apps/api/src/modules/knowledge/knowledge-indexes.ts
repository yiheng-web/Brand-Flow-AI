import type { Model } from 'mongoose'
import type { KnowledgeDocument } from './schemas/knowledge.schema'

export async function migrateKnowledgeIndexes(model: Model<KnowledgeDocument>): Promise<void> {
  await model.createCollection()
  await model.updateMany(
    { spaceId: 'personal', spaceType: { $exists: false }, creatorId: { $type: 'objectId' } },
    { $set: { spaceType: 'personal' } },
  )
  const uncovered = await model.countDocuments({
    spaceId: { $type: 'string' },
    $or: [
      { spaceType: { $nin: ['personal', 'team', 'enterprise'] } },
      { spaceType: 'personal', creatorId: { $not: { $type: 'objectId' } } },
    ],
  })
  if (uncovered)
    throw new Error('知识库存在缺失空间类型或个人创建者的记录；核对并补齐归属后才能迁移索引')
  // 先成功建立两个新唯一索引，再移除精确匹配的旧索引；冲突时保留旧保护并阻止启动。
  await model.createIndexes()
  const indexes = await model.collection.indexes()
  for (const index of indexes) {
    if (
      index.name === 'spaceId_1_name_1' &&
      index.unique &&
      Object.keys(index.key).length === 2 &&
      index.key.spaceId === 1 &&
      index.key.name === 1
    ) {
      await model.collection.dropIndex(index.name)
    }
  }
}
