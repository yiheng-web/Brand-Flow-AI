const path = require('node:path')
const { createRequire } = require('node:module')
const apiRequire = createRequire(path.resolve(__dirname, '../apps/api/package.json'))
const { Types, createConnection } = apiRequire('mongoose')

function id(value) {
  if (value === undefined || value === null) return value
  if (value instanceof Types.ObjectId) return value
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw new Error('资源关联 ID 无效，迁移未提交')
  return new Types.ObjectId(value)
}

async function migrateCollabResources(connection, apply = false) {
  return connection.transaction(async (session) => {
    const counts = {}
    for (const [name, fields] of [
      ['assets', ['ownerId', 'creatorId', 'enterpriseId']],
      ['works', ['workflowId', 'ownerId', 'creatorId', 'enterpriseId']],
      [
        'workversions',
        ['workId', 'sourceWorkflowId', 'sourceRevisionId', 'createdBy', 'enterpriseId'],
      ],
      ['exportlogs', ['workId', 'enterpriseId', 'exportedBy']],
    ]) {
      const collection = connection.collection(name)
      counts[name] = 0
      for await (const record of collection.find({}, { session })) {
        const update = {}
        for (const field of fields)
          if (typeof record[field] === 'string') update[field] = id(record[field])
        if (name === 'assets' && record.visibility === 'public') {
          if (
            record.ownerType !== 'enterprise' ||
            String(record.ownerId) !== String(record.enterpriseId)
          )
            throw new Error('旧 public 素材归属不明确，迁移未提交')
          update.visibility = 'enterprise'
        }
        if (name === 'works') {
          const type = record.spaceType
          if (!['personal', 'team', 'enterprise'].includes(type))
            throw new Error('作品空间类型无效')
          if (type !== 'personal') {
            const team =
              type === 'team'
                ? await connection
                    .collection('teams')
                    .findOne({ _id: id(record.spaceId) }, { session })
                : undefined
            const enterpriseId = type === 'team' ? team?.enterpriseId : record.spaceId
            if (
              !enterpriseId ||
              String(enterpriseId) !== String(record.enterpriseId) ||
              !(await connection
                .collection('enterprises')
                .findOne({ _id: id(enterpriseId) }, { session }))
            )
              throw new Error('作品与真实组织归属不一致，迁移未提交')
          } else if (record.spaceId !== 'personal' || record.enterpriseId)
            throw new Error('个人作品空间归属无效')
          const ownerId = id(type === 'personal' ? record.creatorId : record.spaceId)
          const ownerType = type === 'personal' ? 'user' : type
          const visibility = type === 'personal' ? 'private' : type
          if (
            String(record.ownerId) !== String(ownerId) ||
            record.ownerType !== ownerType ||
            record.visibility !== visibility
          )
            Object.assign(update, { ownerId, ownerType, visibility })
        }
        if (name === 'workversions') {
          const work = await connection
            .collection('works')
            .findOne({ _id: id(record.workId) }, { session })
          if (!work) throw new Error('版本缺少父作品，迁移未提交')
          if (record.sourceWorkflowId) {
            const workflow = await connection
              .collection('workflows')
              .findOne(
                {
                  _id: id(record.sourceWorkflowId),
                  spaceId: work.spaceId,
                  ...(work.enterpriseId
                    ? { entId: String(work.enterpriseId) }
                    : { userId: String(work.creatorId) }),
                },
                { session },
              )
            if (
              !workflow ||
              (record.sourceObjectKey &&
                (!record.sourceObjectKey.startsWith(
                  `workflows/${workflow.userId}/${workflow._id}/`,
                ) ||
                  record.sourceObjectKey.includes('..')))
            )
              throw new Error('版本来源工作流或对象跨空间，迁移未提交')
          }
          if (
            (record.spaceId && record.spaceId !== work.spaceId) ||
            (record.spaceType && record.spaceType !== work.spaceType) ||
            (record.enterpriseId && String(record.enterpriseId) !== String(work.enterpriseId))
          )
            throw new Error('版本存在跨空间归属，迁移未提交')
          if (!record.spaceId || !record.spaceType || (work.enterpriseId && !record.enterpriseId))
            Object.assign(update, {
              spaceId: work.spaceId,
              spaceType: work.spaceType,
              ...(work.enterpriseId ? { enterpriseId: id(work.enterpriseId) } : {}),
            })
        }
        if (Object.keys(update).length) {
          counts[name] += 1
          if (apply) await collection.updateOne({ _id: record._id }, { $set: update }, { session })
        }
      }
    }
    return { ...counts, applied: apply }
  })
}

module.exports = { migrateCollabResources }
if (require.main === module) {
  const uri = process.env.COLLAB_MIGRATION_URI
  const dbName = process.env.COLLAB_MIGRATION_DB
  if (!uri || !dbName || ['admin', 'local', 'config'].includes(dbName))
    throw new Error(
      '请设置 COLLAB_MIGRATION_URI 和 COLLAB_MIGRATION_DB；默认只检查，--apply 才写入',
    )
  ;(async () => {
    const connection = await createConnection(uri, { dbName }).asPromise()
    try {
      console.log(await migrateCollabResources(connection, process.argv.includes('--apply')))
    } finally {
      await connection.close()
    }
  })().catch(() => {
    console.error('资源迁移失败且未提交，请检查副本集与数据归属')
    process.exitCode = 1
  })
}
