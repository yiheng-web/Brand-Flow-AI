// 只允许专用本机测试实例；使用随机数据库，结束后仅删除本次创建的库。
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
    '用法：node scripts/smoke-knowledge-org.cjs mongodb://127.0.0.1:27019 [已有 Playwright node_modules 路径]；该实例必须为测试副本集',
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
const { KnowledgeModule } = apiRequire('./dist/modules/knowledge/knowledge.module')
const { KnowledgeService } = apiRequire('./dist/modules/knowledge/knowledge.service')
const { WorkflowService } = apiRequire('./dist/modules/workflow/workflow.service')
const { WorkflowProcessor } = apiRequire('./dist/modules/workflow/workflow.processor')
const { WorkflowSchema } = apiRequire('./dist/modules/workflow/schemas/workflow.schema')
const { WorkflowNodeSchema } = apiRequire('./dist/modules/workflow/schemas/workflow-node.schema')
const { OrgModule } = apiRequire('./dist/modules/org/org.module')
const { AuthorizationService } = apiRequire('./dist/modules/org/authorization.service')
const { AuthService } = apiRequire('./dist/modules/auth/auth.service')
const { JwtStrategy } = apiRequire('./dist/modules/auth/guards/jwt.strategy')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
Module._resolveFilename = resolve

async function main() {
  const dbName = `codex_knowledge_org_${Date.now()}_${randomUUID().slice(0, 8)}`
  const secret = randomUUID()
  let app, connection, browser, vite
  try {
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
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      providers: [AuthService, JwtStrategy],
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
    const base = await app.getUrl()
    const auth = app.get(AuthService)
    const service = app.get(KnowledgeService)
    const policy = app.get(AuthorizationService)
    await Promise.all(
      ['User', 'Enterprise', 'Team', 'Invitation', 'Knowledge', 'KnowledgeItem'].map((name) =>
        app.get(getModelToken(name)).init(),
      ),
    )
    const password = randomUUID()
    const register = async (email) => {
      await auth.register({ email, password, nickname: email.split('@')[0] })
      return auth.login({ email, password })
    }
    const call = async (actor, method, route, body, expected = method === 'POST' ? 201 : 200) => {
      const response = await fetch(`${base}/api/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${actor.access_token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const result = await response.json()
      assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`)
      return expected < 400 ? result.data : result
    }
    const owner = await register('owner@knowledge.test')
    const member = await register('member@knowledge.test')
    const viewer = await register('viewer@knowledge.test')
    const outsider = await register('outsider@knowledge.test')
    const admin = await register('admin@knowledge.test')
    const enterprise = await call(owner, 'POST', 'org/enterprise', { name: '规则企业' })
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
    const createBase = (spaceId, name, isRequired = false) =>
      call(owner, 'POST', 'knowledge', { spaceId, name, isRequired })
    const foreignEnterprise = await call(outsider, 'POST', 'org/enterprise', { name: '隔离企业' })
    const foreignBase = await call(outsider, 'POST', 'knowledge', {
      spaceId: foreignEnterprise._id,
      name: '企业必选',
      isRequired: true,
    })
    await call(owner, 'GET', `knowledge/${foreignBase._id}`, undefined, 403)
    const adminBase = await call(admin, 'POST', 'knowledge', {
      spaceId: team._id,
      name: '管理员知识',
    })
    await call(admin, 'PUT', `knowledge/${adminBase._id}`, { name: '管理员更新' })
    const enterpriseBase = await createBase(enterprise._id, '企业必选', true)
    const teamBase = await createBase(team._id, '团队必选', true)
    const chosen = await createBase(team._id, '主动选择')
    const siblingBase = await createBase(sibling._id, '团队必选')
    const personal = await createBase('personal', '个人参考')
    const otherPersonal = await call(outsider, 'POST', 'knowledge', {
      spaceId: 'personal',
      name: '个人参考',
    })
    await call(owner, 'POST', 'knowledge', { spaceId: team._id, name: '团队必选' }, 409)
    const add = (kb, title, content, constraintLevel = 'required', metadata) =>
      call(owner, 'POST', `knowledge/${kb._id}/items`, {
        title,
        content,
        constraintLevel,
        ...(metadata ? { metadata } : {}),
      })
    await add(enterpriseBase, '企业品牌色', '品牌色: #00A862')
    await add(enterpriseBase, 'Logo规则', 'Logo禁用: 拉伸', 'recommended')
    await add(enterpriseBase, '文案规则', '禁用文案: 最低价', 'optional')
    for (const content of ['品牌色: #000000', 'Logo使用: 拉伸', '必用文案: 最低价']) {
      const error = await call(
        owner,
        'POST',
        `knowledge/${teamBase._id}/items`,
        { title: '冲突', content, metadata: { inheritanceConfirmed: true } },
        409,
      )
      assert.match(error.message, /企业强制规则/)
    }
    await call(
      owner,
      'POST',
      `knowledge/${teamBase._id}/items`,
      { title: '复杂自然语言', content: '视觉年轻化' },
      409,
    )
    const natural = await add(teamBase, '复杂自然语言', '视觉年轻化', 'recommended', {
      inheritanceConfirmed: true,
    })
    await call(
      owner,
      'PUT',
      `knowledge/${teamBase._id}/items/${natural.item._id}`,
      { content: '视觉更时尚' },
      409,
    )
    await call(
      owner,
      'PUT',
      `knowledge/${teamBase._id}/items/${natural.item._id}`,
      { content: '品牌色: #000000', metadata: { inheritanceConfirmed: true } },
      409,
    )
    assert.equal(
      (await service.findItem(owner.user.id.toString(), teamBase._id, natural.item._id)).content,
      '视觉年轻化',
    )
    await add(chosen, '选择参考', '保持清晰留白', 'optional', { inheritanceConfirmed: true })
    await add(personal, '个人参考规则', '适合移动端', 'optional')
    const batch = randomUUID()
    const items = Array.from({ length: 35 }, (_, i) => ({
      title: `团队强制${i}`,
      content: `保留团队规则${i}`,
      constraintLevel: 'required',
    }))
    await call(owner, 'POST', `knowledge/${teamBase._id}/import`, {
      batchId: batch,
      items,
      confirmInheritance: true,
    })
    await call(owner, 'POST', `knowledge/${teamBase._id}/import`, {
      batchId: batch,
      items,
      confirmInheritance: true,
    })
    assert.equal((await service.findItems(owner.user.id.toString(), teamBase._id)).length, 36)
    for (const actor of [member, viewer]) {
      const list = await call(actor, 'GET', `knowledge?spaceId=${team._id}`)
      assert.ok(list.some((kb) => kb._id === enterpriseBase._id))
      assert.ok(!list.some((kb) => kb._id === siblingBase._id || kb._id === otherPersonal._id))
      await call(actor, 'POST', 'knowledge', { name: '越权', spaceId: team._id }, 403)
      await call(
        actor,
        'POST',
        `knowledge/${teamBase._id}/items`,
        { title: '越权', content: '越权' },
        403,
      )
      await call(actor, 'PUT', `knowledge/${teamBase._id}`, { name: '越权' }, 403)
      await call(actor, 'DELETE', `knowledge/${teamBase._id}`, undefined, 403)
    }
    await call(outsider, 'GET', `knowledge?spaceId=${team._id}`, undefined, 403)
    await call(outsider, 'GET', `knowledge/${teamBase._id}`, undefined, 403)
    await call(owner, 'GET', `knowledge/${otherPersonal._id}`, undefined, 404)
    const Workflow = connection.model('Workflow', WorkflowSchema)
    const Node = connection.model('WorkflowNode', WorkflowNodeSchema)
    const knowledge = app.get(getModelToken('Knowledge'))
    const itemModel = app.get(getModelToken('KnowledgeItem'))
    const workflowService = new WorkflowService(Workflow, Node, null, null, knowledge, null, policy)
    const workflow = await workflowService.create(
      {
        prompt: '知识继承验收',
        spaceId: team._id,
        selectedKnowledgeBaseIds: [chosen._id, personal._id],
      },
      owner.user.id.toString(),
    )
    const stored = await Workflow.findById(workflow.id)
    assert.deepEqual(
      new Set(stored.selectedKnowledgeBaseIds),
      new Set([enterpriseBase._id, teamBase._id, chosen._id, personal._id]),
    )
    const processor = new WorkflowProcessor(Workflow, Node, null, itemModel, null)
    const constraints = await processor.buildConstraintPackage(stored)
    assert.equal(constraints.required.length, 38)
    assert.deepEqual(
      new Set(constraints.sources.map((source) => source.spaceType)),
      new Set(['enterprise', 'team', 'personal']),
    )
    await assert.rejects(
      workflowService.create(
        { prompt: '个人越权', spaceId: team._id, selectedKnowledgeBaseIds: [otherPersonal._id] },
        owner.user.id.toString(),
      ),
      /不属于/,
    )
    await assert.rejects(
      workflowService.create(
        { prompt: '越权', spaceId: team._id, selectedKnowledgeBaseIds: [siblingBase._id] },
        member.user.id.toString(),
      ),
      /不属于/,
    )
    await assert.rejects(
      workflowService.create({ prompt: '越权', spaceId: team._id }, viewer.user.id.toString()),
      /无权/,
    )
    // 两个相反的文案规则并发写入；企业事务锁保证只能成功一个。
    const parallel = await Promise.allSettled([
      service.createItem(owner.user.id.toString(), siblingBase._id, {
        title: '并发甲',
        content: '必用文案: 并发验证',
        constraintLevel: 'required',
      }),
      service.createItem(owner.user.id.toString(), siblingBase._id, {
        title: '并发乙',
        content: '禁用文案: 并发验证',
        constraintLevel: 'required',
      }),
    ])
    assert.equal(parallel.filter((result) => result.status === 'fulfilled').length, 1)
    // 个人强制冲突在工作流装配时再次拒绝，不能借个人来源绕过企业规则。
    await add(personal, '个人冲突', '品牌色: #000000')
    await assert.rejects(processor.buildConstraintPackage(stored), /企业强制规则/)
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
                user: { id: actor.user.id, email: actor.user.email, name: '知识验收' },
              },
              version: 0,
            }),
          ),
        { actor: owner },
      )
      const page = await context.newPage()
      await page.goto(vite.resolvedUrls.local[0] + 'knowledge')
      await page.getByText('个人参考', { exact: true }).waitFor()
      await page.getByRole('button', { name: /当前空间/ }).click()
      await page.getByRole('menuitem', { name: /甲团队/ }).click()
      await page.getByText('团队必选', { exact: true }).waitFor()
      await page.getByText('企业必选', { exact: true }).waitFor()
      await page.getByRole('combobox', { name: '规则来源筛选' }).click()
      await page.getByText('来自企业', { exact: true }).click()
      assert.equal(await page.getByText('团队必选', { exact: true }).count(), 0)
      await page.getByRole('combobox', { name: '规则来源筛选' }).press('Escape')
      await page.locator('.ant-select-dropdown').waitFor({ state: 'hidden' })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      )
      assert.ok(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1))
      await page.screenshot({ path: path.join(root, '.tmp/knowledge-mobile.png'), fullPage: true })
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.getByRole('button', { name: /首页$/ }).click()
      await page.getByRole('button', { name: '选择知识库', exact: true }).click()
      const mandatory = page.getByRole('button', { name: /团队必选.*自动必选/ })
      await mandatory.waitFor()
      assert.equal(await mandatory.isDisabled(), true)
      assert.equal(await mandatory.getAttribute('aria-pressed'), 'true')
      await page.goto(vite.resolvedUrls.local[0] + `knowledge/${teamBase._id}`)
      await page.getByRole('button', { name: /新增知识项$/ }).click()
      await page.getByLabel('标题', { exact: true }).fill('浏览器冲突')
      await page.getByLabel('内容', { exact: true }).fill('品牌色: #000000')
      await page.getByRole('button', { name: /创\s*建$/ }).click()
      await page
        .getByText(/与企业强制规则/)
        .first()
        .waitFor()
      assert.ok(await page.getByRole('dialog').isVisible())
      console.log('PASS Edge: 真实空间切换、来源筛选、390px布局、首页必选、冲突提示及保留表单')
    }
    console.log(
      'PASS Mongo/HTTP: 组织索引隔离、读写矩阵、规则冲突、确认、导入幂等、工作流三来源及38条强制规则',
    )
  } finally {
    await browser?.close()
    await vite?.close()
    if (connection?.readyState === 1) await connection.dropDatabase()
    await app?.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
