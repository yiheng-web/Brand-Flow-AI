const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '..')
const apiRequire = Module.createRequire(path.join(root, 'apps/api/package.json'))
const webRequire = Module.createRequire(path.join(root, 'apps/web/package.json'))
const [mongoUri, browserModules] = process.argv.slice(2)
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):27019\/?$/.test(mongoUri ?? ''))
  throw new Error(
    '用法：node scripts/smoke-collab-resources.cjs mongodb://127.0.0.1:27019 [Playwright node_modules 路径]；仅使用独立测试副本集',
  )
apiRequire('reflect-metadata')
const { Module: NestModule, ValidationPipe } = apiRequire('@nestjs/common')
const { NestFactory } = apiRequire('@nestjs/core')
const { ConfigModule } = apiRequire('@nestjs/config')
const { MongooseModule, getConnectionToken, getModelToken } = apiRequire('@nestjs/mongoose')
const { JwtModule } = apiRequire('@nestjs/jwt')
const { PassportModule } = apiRequire('@nestjs/passport')
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
process.env.BRAND_FLOW_DEMO_MODE = 'true'
const load = (name, file) => apiRequire(`./dist/modules/${file}`)[name]
const OrgModule = load('OrgModule', 'org/org.module')
const KnowledgeModule = load('KnowledgeModule', 'knowledge/knowledge.module')
const AuthorizationService = load('AuthorizationService', 'org/authorization.service')
const AuthService = load('AuthService', 'auth/auth.service')
const JwtStrategy = load('JwtStrategy', 'auth/guards/jwt.strategy')
const AssetsService = load('AssetsService', 'assets/assets.service')
const AssetsController = load('AssetsController', 'assets/assets.controller')
const WorksService = load('WorksService', 'works/works.service')
const WorksController = load('WorksController', 'works/works.controller')
const WorkflowService = load('WorkflowService', 'workflow/workflow.service')
const WorkflowController = load('WorkflowController', 'workflow/workflow.controller')
const WorkflowReferencesService = load(
  'WorkflowReferencesService',
  'workflow/workflow-references.service',
)
const StorageService = load('StorageService', 'storage/storage.service')
const WorkflowProcessor = load('WorkflowProcessor', 'workflow/workflow.processor')
const { WORKFLOW_QUEUE } = apiRequire('./dist/modules/workflow/workflow.constants')
const schemas = [
  ['Asset', 'assets/asset.schema'],
  ['Work', 'works/schemas/work.schema'],
  ['WorkVersion', 'works/schemas/work-version.schema'],
  ['ExportLog', 'works/schemas/export-log.schema'],
  ['Workflow', 'workflow/schemas/workflow.schema'],
  ['WorkflowNode', 'workflow/schemas/workflow-node.schema'],
  ['WorkflowRevision', 'workflow/schemas/workflow-revision.schema'],
].map(([name, file]) => ({ name, schema: load(`${name}Schema`, file) }))
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
Module._resolveFilename = resolve
const { migrateCollabResources } = require('./migrate-collab-resources.cjs')

async function main() {
  const dbName = `codex_collab_${Date.now()}_${randomUUID().slice(0, 8)}`
  const secret = randomUUID()
  const objects = new Map()
  const signed = []
  // 使用内存对象存储验证业务边界与补偿，不连接真实 MinIO 或模型 Provider。
  let storage = {
    uploadObject: async ({ key, body, contentType }) => {
      objects.set(key, { bytes: Buffer.from(body), contentType })
      return { key, bucket: 'test' }
    },
    getObjectUrl: (key) => `https://storage.test.invalid/${key}`,
    getObject: async (key) => {
      assert.ok(objects.has(key), `对象不存在：${key}`)
      return objects.get(key)
    },
    getObjectPrefix: async (key, size) => {
      const object = await storage.getObject(key)
      return { ...object, bytes: object.bytes.subarray(0, size) }
    },
    getSignedUrl: async (key) => {
      const object = await storage.getObject(key)
      signed.push(key)
      return `data:${object.contentType};base64,${object.bytes.toString('base64')}`
    },
    deleteObject: async (key) => {
      objects.delete(key)
    },
  }
  let app, connection, browser, vite, workflowService, s3Fixture, queue, worker
  try {
    if (process.env.COLLAB_REAL_STORAGE === 'true') {
      const { startS3Fixture } = require('./garage-fixture.cjs')
      const { ConfigService } = apiRequire('@nestjs/config')
      const { randomBytes } = require('node:crypto')
      const access = `GK${randomBytes(16).toString('hex')}`
      const secret = randomBytes(32).toString('hex')
      s3Fixture = await startS3Fixture(access, secret, 'v2-collab')
      storage = new StorageService(
        new ConfigService({
          MINIO_ENDPOINT: '127.0.0.1',
          MINIO_PORT: s3Fixture.port,
          MINIO_ACCESS_KEY: access,
          MINIO_SECRET_KEY: secret,
          MINIO_BUCKET: 'v2-collab',
          MINIO_REGION: 'us-east-1',
        }),
      )
      await storage.checkReady()
      const sign = storage.getSignedUrl.bind(storage)
      storage.getSignedUrl = async (...args) => {
        signed.push(args[0])
        return sign(...args)
      }
    }
    class SmokeApp {}
    NestModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: secret })],
        }),
        MongooseModule.forRoot(mongoUri, { dbName }),
        OrgModule,
        KnowledgeModule,
        MongooseModule.forFeature(schemas),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      controllers: [AssetsController, WorksController, WorkflowController],
      providers: [
        AuthService,
        JwtStrategy,
        AssetsService,
        WorksService,
        WorkflowReferencesService,
        { provide: StorageService, useValue: storage },
        {
          provide: WorkflowService,
          useValue: {
            create: (...args) => workflowService.create(...args),
            getWorkflowDetail: (...args) => workflowService.getWorkflowDetail(...args),
            listWorkflows: (...args) => workflowService.listWorkflows(...args),
          },
        },
      ],
    })(SmokeApp)
    app = await NestFactory.create(SmokeApp, { logger: ['error'] })
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    )
    app.useGlobalInterceptors(new TransformInterceptor())
    app.useGlobalFilters(new AllExceptionsFilter())
    await app.listen(0, '127.0.0.1')
    connection = app.get(getConnectionToken())
    const model = (name) => app.get(getModelToken(name))
    await Promise.all(
      [...schemas.map(({ name }) => name), 'User', 'Team', 'Enterprise', 'Invitation'].map((name) =>
        model(name).init(),
      ),
    )
    workflowService = new WorkflowService(
      model('Workflow'),
      model('WorkflowNode'),
      model('WorkflowRevision'),
      null,
      model('Knowledge'),
      storage,
      app.get(AuthorizationService),
      app.get(WorkflowReferencesService),
    )
    if (s3Fixture) {
      const { Queue, Worker } = apiRequire('bullmq')
      const redis = { host: '127.0.0.1', port: 6381 }
      queue = new Queue(WORKFLOW_QUEUE, { connection: redis, prefix: dbName })
      workflowService = new WorkflowService(
        model('Workflow'),
        model('WorkflowNode'),
        model('WorkflowRevision'),
        queue,
        model('Knowledge'),
        storage,
        app.get(AuthorizationService),
        app.get(WorkflowReferencesService),
      )
      await workflowService.onModuleInit()
      const processor = new WorkflowProcessor(
        model('Workflow'),
        model('WorkflowNode'),
        model('WorkflowRevision'),
        model('KnowledgeItem'),
        storage,
        app.get(WorkflowReferencesService),
      )
      worker = new Worker(WORKFLOW_QUEUE, (job) => processor.process(job), {
        connection: redis,
        prefix: dbName,
      })
    }
    const base = await app.getUrl()
    const password = randomUUID()
    const register = async (email) => {
      await app.get(AuthService).register({ email, password, nickname: email.split('@')[0] })
      const actor = await app.get(AuthService).login({ email, password })
      actor.user.id = String(actor.user.id)
      return actor
    }
    const call = async (actor, method, route, body, expected = method === 'POST' ? 201 : 200) => {
      const form = body instanceof FormData
      const response = await fetch(`${base}/api/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${actor.access_token}`,
          ...(!form ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
      })
      const result = await response.json()
      assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`)
      return expected < 400 ? result.data : result
    }
    const owner = await register('owner@collab.test'),
      member = await register('member@collab.test'),
      viewer = await register('viewer@collab.test'),
      outsider = await register('outsider@collab.test'),
      admin = await register('admin@collab.test')
    const enterprise = await call(owner, 'POST', 'org/enterprise', { name: '共享企业' })
    const team = await call(owner, 'POST', 'org/team', {
      enterpriseId: enterprise._id,
      name: '甲团队',
    })
    const sibling = await call(owner, 'POST', 'org/team', {
      enterpriseId: enterprise._id,
      name: '乙团队',
    })
    for (const [actor, role] of [
      [member, 'member'],
      [viewer, 'viewer'],
      [admin, 'admin'],
    ]) {
      const invitation = await call(owner, 'POST', `org/spaces/${team._id}/invitations`, {
        email: actor.user.email,
        role,
      })
      await call(actor, 'POST', `org/invitations/${invitation.invitation.id}/accept`, {})
    }
    const foreign = await call(outsider, 'POST', 'org/enterprise', { name: '隔离企业' })
    for (const actor of [owner, member, viewer, admin, outsider]) {
      const switched = await call(
        actor,
        'PUT',
        `org/enterprise/${actor === outsider ? foreign._id : enterprise._id}/switch`,
      )
      actor.access_token = switched.access_token
    }
    const png = await apiRequire('sharp')({
      create: { width: 12, height: 12, channels: 3, background: '#008866' },
    })
      .png()
      .toBuffer()
    const upload = (
      actor,
      ownerId,
      ownerType,
      name,
      expected = 201,
      visibility = ownerType === 'user' ? 'private' : ownerType,
    ) => {
      const form = new FormData()
      for (const [key, value] of Object.entries({
        ownerId,
        ownerType,
        name,
        visibility,
        type: 'image',
      }))
        form.append(key, value)
      form.append('file', new Blob([png], { type: 'image/png' }), 'image.png')
      return call(actor, 'POST', 'assets/upload', form, expected)
    }
    const personal = await upload(owner, owner.user.id, 'user', '个人素材')
    const teamAsset = await upload(owner, team._id, 'team', '团队产品')
    const logo = await upload(owner, enterprise._id, 'enterprise', '企业Logo')
    const foreignAsset = await upload(outsider, foreign._id, 'enterprise', '隔离素材')
    await upload(viewer, team._id, 'team', '访客写入', 403)
    await upload(owner, team._id, 'team', '伪可见性', 400, 'enterprise')
    await upload(owner, enterprise._id, 'enterprise', '旧public', 400, 'public')
    await upload(owner, foreign._id, 'enterprise', '跨企业写入', 403)
    for (const actor of [member, viewer]) {
      const assets = await call(actor, 'GET', `assets?spaceId=${team._id}`)
      assert.deepEqual(
        new Set(assets.map((asset) => asset._id)),
        new Set([teamAsset._id, logo._id]),
      )
      assert.ok(assets.every((asset) => asset.canManage === false))
      await call(actor, 'DELETE', `assets/${teamAsset._id}`, undefined, 403)
    }
    await call(outsider, 'GET', `assets?spaceId=${team._id}`, undefined, 403)
    assert.equal((await call(owner, 'GET', 'assets?spaceId=personal')).length, 1)
    const createFlow = (actor, spaceId, references = [], expected = 201) =>
      call(actor, 'POST', 'workflows/create', { prompt: '协作测试', spaceId, references }, expected)
    const workflow = await createFlow(member, team._id, [
      { assetId: teamAsset._id, role: 'product' },
      { assetId: logo._id, role: 'logo' },
    ])
    await createFlow(viewer, team._id, [], 403)
    await createFlow(outsider, team._id, [], 403)
    await createFlow(member, team._id, [{ assetId: personal._id, role: 'logo' }], 404)
    await createFlow(owner, team._id, [{ assetId: foreignAsset._id, role: 'logo' }], 404)
    await createFlow(owner, enterprise._id, [{ assetId: teamAsset._id, role: 'logo' }], 404)
    const foreignFlow = await createFlow(outsider, foreign._id)
    await call(owner, 'GET', `workflows/${foreignFlow.id}`, undefined, 403)
    const execution = await app
      .get(WorkflowReferencesService)
      .forExecution(workflow.references, member.user.id, team._id)
    assert.match(execution[0].imageUrl, /^data:image\/png;base64,/)
    await call(viewer, 'GET', `workflows/${workflow.id}`)
    const finish = async (flow, actor) => {
      const key = `workflows/${actor.user.id}/${flow.id}/runs/1/final.png`
      await storage.uploadObject({ key, body: png, contentType: 'image/png' })
      await model('Workflow').updateOne(
        { _id: flow.id },
        {
          $set: {
            status: 'completed',
            runVersion: 1,
            result: {
              compose: { objectKey: key },
              finalImageUrl: 'client-ignored',
              finalEvaluation: { passed: true, totalScore: 9, issues: [] },
            },
          },
        },
      )
      return key
    }
    await finish(workflow, member)
    const save = (actor, flow, spaceId, title, extra = {}, expected = 201) =>
      call(
        actor,
        'POST',
        'works',
        { title, spaceId, workflowId: flow.id, finalImageUrl: 'ignored', ...extra },
        expected,
      )
    const work = await save(member, workflow, team._id, '团队作品')
    assert.equal(work.ownerType, 'team')
    assert.equal(work.visibility, 'team')
    assert.equal(work.enterpriseId, enterprise._id)
    assert.equal(work.versions[0].spaceId, team._id)
    for (const actor of [owner, admin, member, viewer]) {
      const works = await call(actor, 'GET', `works?spaceId=${team._id}`)
      assert.equal(works.length, 1)
      assert.equal(works[0].creatorId._id, member.user.id)
      assert.equal(works[0].canEdit, actor !== viewer)
      await call(actor, 'POST', `works/${work._id}/versions/${work.versions[0]._id}/export`, {
        format: 'png',
      })
    }
    const secondMember = await register('second@collab.test')
    const invitation = await call(owner, 'POST', `org/spaces/${team._id}/invitations`, {
      email: secondMember.user.email,
      role: 'member',
    })
    await call(secondMember, 'POST', `org/invitations/${invitation.invitation.id}/accept`, {})
    assert.equal((await call(secondMember, 'GET', `works?spaceId=${team._id}`))[0].canEdit, false)
    await call(secondMember, 'DELETE', `works/${work._id}`, undefined, 403)
    await call(viewer, 'DELETE', `works/${work._id}`, undefined, 403)
    await call(outsider, 'GET', `works/${work._id}`, undefined, 403)
    await call(outsider, 'GET', `works?spaceId=${team._id}`, undefined, 403)
    const revisionFlow = await createFlow(admin, team._id)
    await finish(revisionFlow, admin)
    const version = await call(admin, 'POST', `works/${work._id}/versions/from-workflow`, {
      workflowId: revisionFlow.id,
    })
    assert.equal(version.spaceId, team._id)
    assert.equal(version.enterpriseId, enterprise._id)
    assert.ok(version.objectKey.startsWith(`works/${member.user.id}/${work._id}/`))
    const duplicate = await call(admin, 'POST', `works/${work._id}/versions/from-workflow`, {
      workflowId: revisionFlow.id,
    })
    assert.equal(duplicate._id, version._id)
    await call(
      viewer,
      'POST',
      `works/${work._id}/versions/from-workflow`,
      { workflowId: revisionFlow.id },
      403,
    )
    await call(
      member,
      'POST',
      `works/${work._id}/versions/from-workflow`,
      { workflowId: foreignFlow.id },
      404,
    )
    const siblingFlow = await createFlow(owner, sibling._id)
    await finish(siblingFlow, owner)
    await call(
      owner,
      'POST',
      `works/${work._id}/versions/from-workflow`,
      { workflowId: siblingFlow.id },
      404,
    )
    await finish(foreignFlow, outsider)
    const foreignWork = await save(outsider, foreignFlow, foreign._id, '隔离作品')
    await save(owner, foreignFlow, team._id, '跨企业工作流', {}, 404)
    await save(owner, revisionFlow, team._id, '伪造对象', { objectKey: foreignWork.objectKey }, 400)
    const originalKey = teamAsset.objectKey
    await model('Asset').updateOne(
      { _id: teamAsset._id },
      { $set: { objectKey: foreignAsset.objectKey } },
    )
    const signsBefore = signed.length
    await createFlow(member, team._id, [{ assetId: teamAsset._id, role: 'product' }], 400)
    assert.equal(signed.length, signsBefore)
    await model('Asset').updateOne({ _id: teamAsset._id }, { $set: { objectKey: originalKey } })
    await model('WorkVersion').updateOne(
      { _id: version._id },
      { $set: { enterpriseId: foreign._id } },
    )
    await call(member, 'GET', `works/${work._id}`, undefined, 403)
    await model('WorkVersion').updateOne(
      { _id: version._id },
      { $set: { enterpriseId: enterprise._id } },
    )
    await model('WorkVersion').updateOne(
      { _id: version._id },
      { $set: { sourceWorkflowId: foreignFlow.id } },
    )
    await call(member, 'GET', `works/${work._id}`, undefined, 403)
    await model('WorkVersion').updateOne(
      { _id: version._id },
      { $set: { sourceWorkflowId: revisionFlow.id } },
    )
    const headKey = (await model('Work').findById(work._id)).objectKey
    await model('Work').updateOne({ _id: work._id }, { $set: { objectKey: foreignWork.objectKey } })
    await call(member, 'POST', `works/${work._id}/export`, { format: 'png' }, 400)
    await model('Work').updateOne({ _id: work._id }, { $set: { objectKey: headKey } })
    const baseKnowledge = await call(owner, 'POST', 'knowledge', {
      spaceId: team._id,
      name: '团队知识',
    })
    await call(
      owner,
      'POST',
      `assets/${personal._id}/save-to-knowledge`,
      { knowledgeId: baseKnowledge._id },
      400,
    )
    // 原始 collection 模拟历史字符串关联和 public；迁移可重复执行。
    await connection
      .collection('assets')
      .updateOne(
        { _id: new (apiRequire('mongoose').Types.ObjectId)(logo._id) },
        { $set: { ownerId: enterprise._id, enterpriseId: enterprise._id, visibility: 'public' } },
      )
    assert.equal((await migrateCollabResources(connection)).assets, 1)
    await model('WorkVersion').updateOne({ _id: version._id }, { $set: { spaceId: foreign._id } })
    await assert.rejects(migrateCollabResources(connection, true), /跨空间/)
    await model('WorkVersion').updateOne({ _id: version._id }, { $set: { spaceId: team._id } })
    await connection.collection('works').updateOne(
      { _id: new (apiRequire('mongoose').Types.ObjectId)(work._id) },
      {
        $set: {
          creatorId: member.user.id,
          ownerId: member.user.id,
          ownerType: 'user',
          visibility: 'private',
          enterpriseId: enterprise._id,
        },
      },
    )
    await connection.collection('workversions').updateOne(
      { _id: new (apiRequire('mongoose').Types.ObjectId)(work.versions[0]._id) },
      {
        $set: { workId: work._id, createdBy: member.user.id },
        $unset: { spaceId: '', spaceType: '', enterpriseId: '' },
      },
    )
    assert.equal(
      (
        await connection
          .collection('assets')
          .findOne({ _id: new (apiRequire('mongoose').Types.ObjectId)(logo._id) })
      ).visibility,
      'public',
    )
    await migrateCollabResources(connection, true)
    assert.equal((await migrateCollabResources(connection)).assets, 0)
    assert.equal((await migrateCollabResources(connection)).works, 0)
    assert.equal((await migrateCollabResources(connection)).workversions, 0)
    const enterpriseFlow = await createFlow(owner, enterprise._id)
    await finish(enterpriseFlow, owner)
    await save(owner, enterpriseFlow, enterprise._id, '企业作品')
    const personalFlow = await createFlow(owner, 'personal')
    await finish(personalFlow, owner)
    await save(owner, personalFlow, 'personal', '个人作品')
    if (browserModules) {
      const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
      vite = await createServer({
        configFile: path.join(root, 'apps/web/vite.config.ts'),
        root: path.join(root, 'apps/web'),
        server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: base } } },
      })
      await vite.listen()
      const { chromium } = require(path.join(browserModules, 'playwright'))
      browser = await chromium.launch({ channel: 'msedge', headless: true })
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      await context.addInitScript(
        ({ actor }) =>
          localStorage.setItem(
            'brand-flow-auth',
            JSON.stringify({
              state: {
                isLoggedIn: true,
                token: actor.access_token,
                user: { id: actor.user.id, email: actor.user.email, name: '组织验收' },
              },
              version: 0,
            }),
          ),
        { actor: owner },
      )
      const page = await context.newPage()
      const baseUrl = vite.resolvedUrls.local[0]
      const switchSpace = async (name) => {
        await page.getByRole('button', { name: /当前空间/ }).click()
        await page.getByRole('menuitem', { name: new RegExp(name) }).click()
        await page.getByRole('button', { name: new RegExp(`当前空间.*${name}`) }).waitFor()
      }
      await page.goto(baseUrl + 'brand')
      await page.getByText('个人素材', { exact: true }).waitFor()
      await switchSpace('甲团队')
      await page.getByText('团队产品', { exact: true }).waitFor()
      await page.getByText('企业Logo', { exact: true }).waitFor()
      assert.equal(await page.getByText('个人素材', { exact: true }).count(), 0)
      await switchSpace('共享企业')
      await page.getByText('团队产品', { exact: true }).waitFor({ state: 'hidden' })
      await page.getByText('企业Logo', { exact: true }).waitFor()
      assert.equal(await page.getByText('团队产品', { exact: true }).count(), 0)
      await page.getByRole('button', { name: /作品空间$/ }).click()
      await page.getByRole('heading', { name: '企业作品', exact: true }).waitFor()
      await switchSpace('甲团队')
      await page.getByRole('heading', { name: '团队作品', exact: true }).waitFor()
      assert.equal(await page.getByRole('heading', { name: '企业作品', exact: true }).count(), 0)
      await page.getByText(/创建者：member@collab.test/).waitFor()
      await page.getByRole('button', { name: /首页$/ }).click()
      await page.getByRole('button', { name: '参考素材', exact: true }).click()
      await page.getByLabel('参考素材 团队产品', { exact: true }).waitFor()
      await page.getByLabel('参考素材 企业Logo', { exact: true }).waitFor()
      assert.equal(await page.getByLabel('参考素材 个人素材', { exact: true }).count(), 0)
      await page.goto(baseUrl + 'workspace?workflowId=' + workflow.id)
      await page.getByText('创作空间：甲团队', { exact: true }).waitFor()
      await page.goto(baseUrl + 'works')
      await switchSpace('个人空间')
      await page.getByRole('heading', { name: '个人作品', exact: true }).waitFor()
      assert.equal(await page.getByRole('heading', { name: '团队作品', exact: true }).count(), 0)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1)
      await page.screenshot({ path: path.join(root, '.tmp/collab-mobile.png'), fullPage: true })
      const viewerContext = await browser.newContext()
      await viewerContext.addInitScript(
        ({ actor }) =>
          localStorage.setItem(
            'brand-flow-auth',
            JSON.stringify({
              state: {
                isLoggedIn: true,
                token: actor.access_token,
                user: { id: actor.user.id, email: actor.user.email, name: '只读验收' },
              },
              version: 0,
            }),
          ),
        { actor: viewer },
      )
      const viewerPage = await viewerContext.newPage()
      await viewerPage.goto(baseUrl + 'brand')
      await viewerPage.getByRole('button', { name: /当前空间/ }).click()
      await viewerPage.getByRole('menuitem', { name: /甲团队/ }).click()
      await viewerPage.getByText('团队产品', { exact: true }).waitFor()
      for (const button of await viewerPage
        .getByRole('button', { name: /删除$|上传$|创建$/ })
        .all())
        assert.equal(await button.isDisabled(), true)
      await viewerPage.getByRole('button', { name: /作品空间$/ }).click()
      await viewerPage.getByRole('heading', { name: '团队作品', exact: true }).waitFor()
      assert.equal(
        await viewerPage.getByRole('button', { name: '删除团队作品', exact: true }).isDisabled(),
        true,
      )
      await viewerContext.close()
      console.log(
        'PASS Edge: 素材/作品个人-团队-企业切换、创建者、组织参考选择、工作台空间、390px布局',
      )
    }
    const notifications = await call(member, 'GET', 'org/notifications')
    assert.ok(notifications.length > 0)
    assert.ok(notifications.every((item) => item.recipientId === member.user.id))
    const count = (await call(member, 'GET', 'org/notifications/unread-count')).count
    await call(outsider, 'PUT', `org/notifications/${notifications[0]._id}/read`, {}, 404)
    await call(member, 'PUT', `org/notifications/${notifications[0]._id}/read`, {})
    assert.equal((await call(member, 'GET', 'org/notifications/unread-count')).count, count - 1)
    await call(member, 'PUT', `org/notifications/${notifications[0]._id}/read`, {})
    assert.equal((await call(member, 'GET', 'org/notifications/unread-count')).count, count - 1)
    for (const actor of [member, viewer, outsider])
      await call(actor, 'GET', `org/spaces/${team._id}/audits`, undefined, 403)
    const teamAudits = await call(admin, 'GET', `org/spaces/${team._id}/audits`)
    assert.ok(
      teamAudits.length > 0 &&
        teamAudits.every((log) => log.teamId === team._id && log.enterpriseId === enterprise._id),
    )
    await call(admin, 'GET', `org/spaces/${enterprise._id}/audits`, undefined, 403)
    const auditCount = await model('AuditLog').countDocuments({})
    const notificationCount = await model('Notification').countDocuments({})
    const auditModel = model('AuditLog')
    const createAudit = auditModel.create
    auditModel.create = async () => {
      throw new Error('验收注入审计写入故障')
    }
    try {
      await call(
        owner,
        'PUT',
        `org/spaces/${team._id}/members/${member.user.id}`,
        { role: 'viewer' },
        500,
      )
    } finally {
      auditModel.create = createAudit
    }
    assert.equal(
      (await model('User').findById(member.user.id)).memberships.find(
        (item) => String(item.teamId) === team._id,
      ).role,
      'member',
    )
    assert.equal(await model('AuditLog').countDocuments({}), auditCount)
    assert.equal(await model('Notification').countDocuments({}), notificationCount)
    await call(owner, 'PUT', `org/enterprise/${enterprise._id}`, { actorId: outsider.user.id }, 400)
    await call(owner, 'PUT', `org/enterprise/${enterprise._id}`, { name: '验收企业' })
    await call(owner, 'PUT', `org/team/${team._id}`, { description: '审计验收' })
    await call(owner, 'PUT', `knowledge/${baseKnowledge._id}`, { description: '审计验收' })
    const auditItem = await call(owner, 'POST', `knowledge/${baseKnowledge._id}/items`, {
      title: '审计条目',
      content: '验收资料',
      constraintLevel: 'optional',
    })
    await call(owner, 'PUT', `knowledge/${baseKnowledge._id}/items/${auditItem.item._id}`, {
      title: '编辑资料',
    })
    if (s3Fixture) {
      const queuedFlow = await call(member, 'POST', 'workflows/create', {
        prompt: '生成团队品牌产品海报，无文字，不合成',
        spaceId: team._id,
        selectedKnowledgeBaseIds: [baseKnowledge._id],
        references: [
          { assetId: teamAsset._id, role: 'product' },
          { assetId: logo._id, role: 'logo' },
        ],
      })
      const until = async (predicate) => {
        for (let attempt = 0; attempt < 300; attempt++) {
          const flow = await model('Workflow').findById(queuedFlow.id)
          assert.notEqual(flow.status, 'failed', flow.errorMessage)
          if (predicate(flow)) return flow
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        throw new Error('团队真实队列执行超时')
      }
      await workflowService.start(
        queuedFlow.id,
        { needsComposition: false },
        member.user.id,
        enterprise._id,
      )
      await until((flow) => flow.awaitingAction === 'confirm_brief')
      await workflowService.confirmBrief(queuedFlow.id, member.user.id, enterprise._id)
      const direction = await until((flow) => flow.awaitingAction === 'select_direction')
      await workflowService.updateNodeOutput(
        queuedFlow.id,
        'creativeDirection',
        { selectedDirectionId: direction.result.creativeDirection.directions[0].id },
        member.user.id,
        enterprise._id,
      )
      await workflowService.runNode(queuedFlow.id, 'prompt', member.user.id, enterprise._id)
      const generated = await until((flow) => flow.awaitingAction === 'select_candidate')
      await workflowService.updateNodeOutput(
        queuedFlow.id,
        'generate',
        { selectedCandidateId: generated.result.generate.candidates[0].id },
        member.user.id,
        enterprise._id,
      )
      await workflowService.runNode(queuedFlow.id, 'compose', member.user.id, enterprise._id)
      const completed = await until((flow) => flow.status === 'completed')
      assert.ok(completed.result.finalEvaluation.passed)
      const queuedWork = await save(member, queuedFlow, team._id, '真实队列团队作品')
      const exported = await call(viewer, 'POST', `works/${queuedWork._id}/export`, {
        format: 'png',
      })
      assert.equal((await fetch(exported.downloadUrl)).status, 200)
      console.log(
        'PASS V2 Redis/Mongo/S3: 团队知识和参考图→真实 BullMQ 七节点 Demo→作品版本→Viewer 导出',
      )
    }
    await call(owner, 'DELETE', `knowledge/${baseKnowledge._id}/items/${auditItem.item._id}`)
    const deletedKnowledge = await call(owner, 'POST', 'knowledge', {
      spaceId: team._id,
      name: '待删除知识库',
    })
    await call(owner, 'DELETE', `knowledge/${deletedKnowledge._id}`)
    await call(owner, 'DELETE', `assets/${teamAsset._id}`)
    if (s3Fixture) {
      const response = await fetch(await storage.getSignedUrl(teamAsset.objectKey))
      assert.equal(response.status, 404)
    }
    await call(owner, 'PUT', `org/spaces/${team._id}/members/${member.user.id}`, { role: 'viewer' })
    await createFlow(member, team._id, [], 403)
    await call(member, 'POST', `org/spaces/${team._id}/leave`, {})
    await call(member, 'GET', `works/${work._id}`, undefined, 403)
    await call(owner, 'DELETE', `org/spaces/${team._id}/members/${viewer.user.id}`)
    await call(owner, 'DELETE', `org/team/${sibling._id}`)
    const pending = await call(owner, 'POST', `org/spaces/${team._id}/invitations`, {
      email: 'pending@collab.test',
      role: 'member',
    })
    await call(owner, 'POST', `org/invitations/${pending.invitation.id}/cancel`, {})
    const rejected = await call(owner, 'POST', `org/spaces/${team._id}/invitations`, {
      email: outsider.user.email,
      role: 'member',
    })
    await call(outsider, 'POST', `org/invitations/${rejected.invitation.id}/reject`, {})
    // 先建立企业成员关系，再验证 Owner 转移及旧 JWT 的即时权限降级。
    const ownershipInvite = await call(owner, 'POST', `org/spaces/${enterprise._id}/invitations`, {
      email: outsider.user.email,
      role: 'member',
    })
    await call(outsider, 'POST', `org/invitations/${ownershipInvite.invitation.id}/accept`, {})
    await call(owner, 'PUT', `org/enterprise/${enterprise._id}/owner`, {
      targetUserId: outsider.user.id,
    })
    await call(
      owner,
      'PUT',
      `org/enterprise/${enterprise._id}/owner`,
      { targetUserId: member.user.id },
      403,
    )
    await call(outsider, 'PUT', `org/enterprise/${enterprise._id}`, { status: 'disabled' })
    const logs = await model('AuditLog').find({ enterpriseId: enterprise._id }).lean()
    const ownerLogs = await call(outsider, 'GET', `org/spaces/${enterprise._id}/audits`)
    assert.ok(ownerLogs.length > 0 && ownerLogs.length <= 50)
    const olderLogs = await call(
      outsider,
      'GET',
      `org/spaces/${enterprise._id}/audits?before=${ownerLogs.at(-1)._id}`,
    )
    assert.ok(olderLogs.every((log) => log._id < ownerLogs.at(-1)._id))
    for (const action of [
      'enterprise.created',
      'enterprise.updated',
      'enterprise.disabled',
      'team.created',
      'team.updated',
      'team.archived',
      'invitation.created',
      'invitation.accepted',
      'invitation.rejected',
      'invitation.cancelled',
      'member.role_changed',
      'member.left',
      'member.removed',
      'enterprise.owner_transferred',
      'knowledge.created',
      'knowledge.updated',
      'knowledge.item_created',
      'knowledge.item_updated',
      'knowledge.item_deleted',
      'knowledge.deleted',
      'asset.deleted',
    ])
      assert.ok(
        logs.some((log) => log.action === action),
        `缺少审计：${action}；已有 ${logs.map((log) => log.action).join(',')}`,
      )
    assert.ok(
      logs.every(
        (log) =>
          log.actorId &&
          log.resourceId &&
          log.createdAt &&
          Object.keys(log.metadata).every((key) => ['role', 'status', 'isRequired'].includes(key)),
      ),
    )
    for (const route of [
      'org/spaces/invalid/audits',
      'org/spaces/' + enterprise._id + '/audits?before=invalid',
      'org/notifications/invalid/read',
      'org/team/invalid',
      'org/enterprise/invalid',
      'assets/invalid',
      'works/invalid',
      'knowledge/invalid',
      'workflows/invalid',
      'assets?spaceId=invalid',
      'works?spaceId=invalid',
      'workflows?spaceId=invalid',
      'org/teams?enterpriseId=invalid',
      'org/spaces/invalid/members',
      'works/invalid/versions',
      'knowledge/invalid/items/invalid',
    ]) {
      const response = await fetch(`${base}/api/${route}`, {
        method: route.endsWith('/read') ? 'PUT' : 'GET',
        headers: { Authorization: `Bearer ${owner.access_token}` },
      })
      assert.ok([400, 404].includes(response.status), `${route}: ${response.status}`)
    }
    for (const [method, route, body] of [
      ['PUT', 'org/spaces/invalid/members/invalid', { role: 'member' }],
      ['PUT', `org/enterprise/${enterprise._id}/owner`, { targetUserId: 'invalid' }],
      ['POST', 'org/invitations/invalid/accept', {}],
      ['POST', 'org/invitations/invalid/reject', {}],
      ['POST', 'org/invitations/invalid/cancel', {}],
      ['POST', 'org/spaces/invalid/leave', {}],
      ['DELETE', 'assets/invalid'],
      ['DELETE', 'works/invalid'],
      ['DELETE', 'knowledge/invalid'],
      ['POST', 'works/invalid/versions/invalid/export', { format: 'png' }],
      ['POST', 'workflows/create', { prompt: 'ID 校验', spaceId: 'invalid' }],
      [
        'POST',
        'workflows/create',
        {
          prompt: 'ID 校验',
          spaceId: 'personal',
          references: [{ assetId: 'invalid', role: 'logo' }],
        },
      ],
    ]) {
      const response = await fetch(`${base}/api/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${owner.access_token}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      assert.ok([400, 404].includes(response.status), `${method} ${route}: ${response.status}`)
    }
    console.log(
      'PASS V2 审计/通知: 五角色隔离、已读幂等、伪造 actor 拒绝、生命周期事件、降级/退出、ObjectId 边界' +
        (s3Fixture ? '；真实 S3 上传/版本/导出/删除' : '；MockStorage'),
    )
    console.log(
      'PASS Mongo/HTTP: 同团队共享、Viewer只读、创建者/管理员编辑、跨企业素材/工作流/作品/对象拒绝、版本继承/导出/幂等、public迁移',
    )
  } finally {
    await browser?.close()
    await vite?.close()
    await worker?.close()
    if (queue) {
      await workflowService?.onModuleDestroy()
      assert.equal(queue.opts.prefix, dbName)
      await queue.obliterate({ force: true })
      await queue.close()
    }
    if (connection?.readyState === 1) await connection.dropDatabase()
    await app?.close()
    await s3Fixture?.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
