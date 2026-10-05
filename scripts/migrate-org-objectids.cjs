const path = require('node:path')
const { createRequire } = require('node:module')
const apiRequire = createRequire(path.resolve(__dirname, '../apps/api/package.json'))
const { Types, createConnection } = apiRequire('mongoose')

function objectId(value) {
  if (typeof value !== 'string') return value
  if (!/^[a-f\d]{24}$/i.test(value))
    throw new Error('发现无效组织关联 ID，迁移未提交，请先修复数据')
  return new Types.ObjectId(value)
}

async function migrateOrgObjectIds(connection, apply = false) {
  // 先验证所有待迁移 ID，再在同一事务内提交，避免迁移中断留下半转换数据。
  return connection.transaction(async (session) => {
    const userUpdates = [],
      teamUpdates = []
    const users = connection.collection('users')
    const teams = connection.collection('teams')
    for await (const user of users.find(
      {
        $or: [
          { 'memberships.enterpriseId': { $type: 'string' } },
          { 'memberships.teamId': { $type: 'string' } },
          { currentEnterpriseId: { $type: 'string' } },
        ],
      },
      { session, projection: { memberships: 1, currentEnterpriseId: 1 } },
    )) {
      const update = {
        memberships: (user.memberships ?? []).map((membership) => ({
          ...membership,
          enterpriseId: objectId(membership.enterpriseId),
          ...(membership.teamId !== undefined ? { teamId: objectId(membership.teamId) } : {}),
        })),
      }
      if (user.currentEnterpriseId !== undefined)
        update.currentEnterpriseId = objectId(user.currentEnterpriseId)
      userUpdates.push({ updateOne: { filter: { _id: user._id }, update: { $set: update } } })
    }
    for await (const team of teams.find(
      { enterpriseId: { $type: 'string' } },
      { session, projection: { enterpriseId: 1 } },
    )) {
      teamUpdates.push({
        updateOne: {
          filter: { _id: team._id },
          update: { $set: { enterpriseId: objectId(team.enterpriseId) } },
        },
      })
    }
    if (apply) {
      if (userUpdates.length) await users.bulkWrite(userUpdates, { session })
      if (teamUpdates.length) await teams.bulkWrite(teamUpdates, { session })
    }
    return { users: userUpdates.length, teams: teamUpdates.length, applied: apply }
  })
}

module.exports = { migrateOrgObjectIds }
if (require.main === module) {
  const dbName = process.env.ORG_MIGRATION_DB
  const uri = process.env.ORG_MIGRATION_URI
  if (!uri || !dbName || ['admin', 'local', 'config'].includes(dbName))
    throw new Error('请设置 ORG_MIGRATION_URI 和 ORG_MIGRATION_DB；默认只检查，显式 --apply 才写入')
  ;(async () => {
    const connection = await createConnection(uri, { dbName }).asPromise()
    try {
      console.log(await migrateOrgObjectIds(connection, process.argv.includes('--apply')))
    } finally {
      await connection.close()
    }
  })().catch(() => {
    console.error('迁移失败且未提交，请检查副本集与关联 ID；连接信息不会输出')
    process.exitCode = 1
  })
}
