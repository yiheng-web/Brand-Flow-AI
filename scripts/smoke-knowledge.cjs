// 仅在显式指定的本机 Mongo 上创建临时数据库；不会连接项目 .env。
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const Module = require('node:module')
const { randomUUID } = require('node:crypto')

const root = path.resolve(__dirname, '..')
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'))
const mongoose = apiRequire('mongoose')
const uri = process.argv[2]
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(uri ?? '')) {
  throw new Error(
    '用法：node scripts/smoke-knowledge.cjs mongodb://127.0.0.1:27018；仅允许显式本机地址',
  )
}
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
apiRequire('reflect-metadata')
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
const { KnowledgeService } = apiRequire('./dist/modules/knowledge/knowledge.service')
const { KnowledgeSchema } = apiRequire('./dist/modules/knowledge/schemas/knowledge.schema')
const { KnowledgeItemSchema } = apiRequire('./dist/modules/knowledge/schemas/knowledge-item.schema')
const { WorkflowProcessor } = apiRequire('./dist/modules/workflow/workflow.processor')
Module._resolveFilename = resolveFilename

async function main() {
  const database = `codex_knowledge_smoke_${Date.now()}`
  const connection = await mongoose.createConnection(uri, { dbName: database }).asPromise()
  try {
    const Knowledge = connection.model('Knowledge', KnowledgeSchema)
    const Item = connection.model('KnowledgeItem', KnowledgeItemSchema)
    const User = connection.model('User', new mongoose.Schema({ email: String, profile: Object }))
    const users = await User.create([{ email: 'a@smoke.invalid' }, { email: 'b@smoke.invalid' }])
    const [a, b] = users.map((user) => user._id.toString())
    const service = new KnowledgeService(Knowledge, Item, {
      getAccessibleSpace: async (_user, spaceId) => {
        assert.equal(spaceId, 'personal')
        return { spaceId, spaceType: 'personal', role: 'OWNER' }
      },
    })
    await Knowledge.createCollection()
    await Knowledge.collection.createIndex({ spaceId: 1, name: 1 }, { unique: true })
    await Knowledge.collection.insertOne({
      name: '旧记录',
      spaceId: 'personal',
      creatorId: users[0]._id,
    })
    await service.onModuleInit()
    await service.onModuleInit()
    const indexes = await Knowledge.collection.indexes()
    assert.ok(
      indexes.some((index) => index.name === 'knowledge_personal_name_unique' && index.unique),
    )
    assert.ok(!indexes.some((index) => index.name === 'spaceId_1_name_1'))
    assert.equal((await Knowledge.findOne({ name: '旧记录' })).spaceType, 'personal')
    const ka = await service.create(a, { name: '同名品牌', spaceId: 'personal' })
    const kb = await service.create(b, { name: '同名品牌', spaceId: 'personal' })
    assert.notEqual(ka.id, kb.id)
    await assert.rejects(
      service.create(a, { name: '同名品牌', spaceId: 'personal' }),
      (error) => error.getStatus() === 409,
    )
    await assert.rejects(service.findOne(b, ka.id), (error) => error.getStatus() === 404)
    const preview = await service.previewImport(
      a,
      ka.id,
      Array.from({ length: 31 }, (_, i) => `[required] 必须保留规则${i + 1}`).join('\n'),
    )
    assert.equal(await Item.countDocuments({ knowledgeId: ka._id }), 0)
    const batch = randomUUID()
    const imported = await service.importItems(a, ka.id, batch, preview)
    assert.equal(imported.imported, 31)
    assert.equal(imported.vectorized, false)
    assert.match(imported.message, /已导入到知识库，语义向量未启用/)
    await service.importItems(a, ka.id, batch, preview)
    await Promise.all([
      service.importItems(a, ka.id, batch, preview),
      service.importItems(a, ka.id, batch, preview),
    ])
    assert.equal(await Item.countDocuments({ knowledgeId: ka._id }), 31)
    assert.equal((await service.findItems(a, ka.id)).length, 31)
    const processor = new WorkflowProcessor(null, null, null, Item, null)
    const constraint = await processor.buildConstraintPackage({ selectedKnowledgeBaseIds: [ka.id] })
    assert.equal(constraint.required.length, 31)
    assert.ok(constraint.required.some((rule) => rule.description === '必须保留规则31'))
    assert.ok(
      constraint.sources.every((source) => source.knowledgeBaseId === ka.id && source.itemId),
    )
    for (const constraintLevel of ['recommended', 'optional']) {
      await Item.insertMany(
        Array.from({ length: 35 }, (_, index) => ({
          knowledgeId: ka._id,
          spaceId: 'personal',
          spaceType: 'personal',
          creatorId: users[0]._id,
          title: `${constraintLevel}-${index}`,
          content: `参考${index}`,
          constraintLevel,
          status: 'active',
          sourceType: 'manual',
        })),
      )
    }
    const bounded = await processor.buildConstraintPackage({ selectedKnowledgeBaseIds: [ka.id] })
    assert.equal(bounded.required.length, 31)
    assert.equal(bounded.recommended.length, 30)
    assert.equal(bounded.optional.length, 30)
    assert.equal(bounded.recommended[0].title, 'recommended-0')
    await Item.deleteMany({ knowledgeId: ka._id, constraintLevel: { $ne: 'required' } })
    assert.deepEqual(await processor.buildConstraintPackage({ selectedKnowledgeBaseIds: [] }), {
      required: [],
      recommended: [],
      optional: [],
      sources: [],
    })
    const { item } = await service.createItem(a, ka.id, {
      title: '手工',
      content: '蓝色',
      constraintLevel: 'required',
    })
    await service.updateItem(a, ka.id, item.id, { title: '更新', content: '深蓝色' })
    assert.equal((await service.findItem(a, ka.id, item.id)).content, '深蓝色')
    await service.updateItem(a, ka.id, item.id, { status: 'archived' })
    assert.equal(
      (await processor.buildConstraintPackage({ selectedKnowledgeBaseIds: [ka.id] })).required
        .length,
      31,
    )
    await service.updateItem(a, ka.id, item.id, { status: 'active' })
    assert.equal(
      (await processor.buildConstraintPackage({ selectedKnowledgeBaseIds: [ka.id] })).required
        .length,
      32,
    )
    await service.removeItem(a, ka.id, item.id)
    assert.equal(await Item.countDocuments({ knowledgeId: ka._id }), 31)
    await service.remove(a, ka.id)
    assert.equal(await Item.countDocuments({ knowledgeId: ka._id }), 0)
    console.log(
      'PASS：真实 Mongo 索引迁移、A/B 同名隔离、409、31 条 required、导入幂等、持久化及知识项维护',
    )
  } finally {
    assert.ok(connection.name.startsWith('codex_knowledge_smoke_'))
    await connection.dropDatabase()
    await connection.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
