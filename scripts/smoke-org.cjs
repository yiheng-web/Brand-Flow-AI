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
    '用法：node scripts/smoke-org.cjs mongodb://127.0.0.1:27019 [已有 Playwright node_modules 路径]；该实例必须为测试副本集',
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
const { OrgModule } = apiRequire('./dist/modules/org/org.module')
const { AuthorizationService } = apiRequire('./dist/modules/org/authorization.service')
const { AuthService } = apiRequire('./dist/modules/auth/auth.service')
const { JwtStrategy } = apiRequire('./dist/modules/auth/guards/jwt.strategy')
const { AssetSchema } = apiRequire('./dist/modules/assets/asset.schema')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
Module._resolveFilename = resolve

async function main() {
  const dbName = `codex_org_${Date.now()}_${randomUUID().slice(0, 8)}`
  const secret = randomUUID()
  let app, vite, browser, connection
  try {
    class SmokeApp {}
    NestModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: secret, ORG_MAX_OWNED_ENTERPRISES: 2 })],
        }),
        MongooseModule.forRoot(mongoUri, { dbName }),
        OrgModule,
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
    const policy = app.get(AuthorizationService)
    const users = app.get(getModelToken('User'))
    const invitations = app.get(getModelToken('Invitation'))
    const teams = app.get(getModelToken('Team'))
    await Promise.all(
      ['User', 'Enterprise', 'Team', 'Invitation'].map((name) =>
        app.get(getModelToken(name)).init(),
      ),
    )
    const password = randomUUID()
    const register = async (email) => {
      await auth.register({ email, password, nickname: email.split('@')[0] })
      return auth.login({ email, password })
    }
    const request = async (actor, method, route, body, status) => {
      const response = await fetch(`${base}/api/org/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${actor.access_token}`,
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const result = await response.json()
      assert.equal(
        response.status,
        status ?? (method === 'POST' ? 201 : 200),
        `${method} ${route}: ${JSON.stringify(result)}`,
      )
      return result.data
    }
    const owner = await register('owner@example.test')
    const admin = await register('admin@example.test')
    const outsider = await register('outsider@example.test')
    const enterprise = await request(owner, 'POST', 'enterprise', { name: '事务测试企业' })
    const enterpriseId = enterprise._id
    const team = await request(owner, 'POST', 'team', {
      enterpriseId,
      name: '设计团队',
      description: '测试团队',
    })
    const teamId = team._id
    const invite = (actor, space, email, role = 'member') =>
      request(actor, 'POST', `spaces/${space}/invitations`, { email, role })
    const adminInvite = await invite(owner, enterpriseId, 'admin@example.test', 'admin')
    await request(admin, 'POST', `invitations/${adminInvite.invitation.id}/accept`, {})
    const viewerInvite = await invite(owner, teamId, 'viewer@example.test', 'viewer')
    const viewer = await register('viewer@example.test')
    await request(viewer, 'POST', `invitations/${viewerInvite.invitation.id}/accept`, {})
    assert.equal(
      (await policy.assertCanReadSpace(viewer.user.id.toString(), enterpriseId)).role,
      'viewer',
    )
    await assert.rejects(
      policy.assertCanWriteSpace(viewer.user.id.toString(), enterpriseId),
      /无权/,
    )
    const malformed = await register('malformed@example.test')
    await users.collection.updateOne(
      { _id: malformed.user.id },
      {
        $set: {
          memberships: [
            {
              enterpriseId: new (apiRequire('mongoose').Types.ObjectId)(),
              teamId: new (apiRequire('mongoose').Types.ObjectId)(teamId),
              role: 'member',
            },
          ],
        },
      },
    )
    assert.ok(
      !(await request(owner, 'GET', `spaces/${teamId}/members`)).some(
        (item) => item.userId === malformed.user.id.toString(),
      ),
    )
    const memberInvite = await invite(owner, teamId, 'new@example.test')
    await request(owner, 'POST', `spaces/${teamId}/invitations`, { email: 'NEW@example.test' }, 409)
    assert.equal(await users.countDocuments({ email: 'new@example.test' }), 0)
    const stored = await invitations.findById(memberInvite.invitation.id).select('+tokenHash')
    assert.notEqual(stored.tokenHash, memberInvite.inviteCode)
    const member = await register('NEW@example.test')
    await assert.rejects(auth.register({ email: 'new@example.test', password }), /已被注册/)
    await request(outsider, 'POST', `invitations/${memberInvite.invitation.id}/accept`, {}, 404)
    await request(
      member,
      'POST',
      `invitations/${memberInvite.invitation.id}/accept`,
      { inviteCode: 'wrong' },
      403,
    )
    const accepts = await Promise.all(
      [1, 2].map(() =>
        request(member, 'POST', `invitations/${memberInvite.invitation.id}/accept`, {
          inviteCode: memberInvite.inviteCode,
        }),
      ),
    )
    assert.ok(accepts.every((item) => item.status === 'accepted'))
    assert.equal((await users.findById(member.user.id)).memberships.length, 2)
    assert.ok((await request(member, 'GET', 'spaces')).some((space) => space.spaceId === teamId))
    await request(
      member,
      'PUT',
      `spaces/${teamId}/members/${admin.user.id}`,
      { role: 'viewer' },
      403,
    )
    await request(admin, 'PUT', `spaces/${teamId}/members/${member.user.id}`, { role: 'viewer' })
    await request(
      admin,
      'PUT',
      `spaces/${enterpriseId}/members/${admin.user.id}`,
      { role: 'owner' },
      403,
    )
    await request(
      admin,
      'PUT',
      `spaces/${teamId}/members/${member.user.id}`,
      { role: 'admin' },
      403,
    )
    await request(owner, 'POST', `spaces/${enterpriseId}/leave`, {}, 403)
    await request(
      owner,
      'DELETE',
      `spaces/${enterpriseId}/members/${owner.user.id}`,
      undefined,
      403,
    )
    await request(member, 'POST', `spaces/${teamId}/leave`, {})
    assert.ok(!(await request(member, 'GET', 'spaces')).some((space) => space.spaceId === teamId))
    await request(member, 'POST', `invitations/${memberInvite.invitation.id}/accept`, {})
    assert.equal((await users.findById(member.user.id)).memberships.length, 1)
    const newInvite = await invite(owner, teamId, 'new@example.test')
    await request(member, 'POST', `invitations/${newInvite.invitation.id}/accept`, {})
    await request(admin, 'DELETE', `spaces/${teamId}/members/${member.user.id}`)
    await request(outsider, 'PUT', `enterprise/${enterpriseId}`, { name: '篡改' }, 403)
    await request(
      owner,
      'PUT',
      `enterprise/${enterpriseId}/owner`,
      { targetUserId: outsider.user.id },
      400,
    )

    const rejected = await invite(owner, enterpriseId, 'outsider@example.test')
    await request(outsider, 'POST', `invitations/${rejected.invitation.id}/reject`, {})
    const cancelled = await invite(owner, teamId, 'outsider@example.test')
    await request(owner, 'POST', `invitations/${cancelled.invitation.id}/cancel`, {})
    await request(outsider, 'POST', `invitations/${cancelled.invitation.id}/accept`, {}, 409)
    const expired = await invite(owner, teamId, 'outsider@example.test')
    await invitations.updateOne(
      { _id: expired.invitation.id },
      { $set: { expiresAt: new Date(0) } },
    )
    assert.ok(
      (await request(outsider, 'GET', 'invitations?direction=received')).some(
        (item) => item.id === expired.invitation.id && item.status === 'expired',
      ),
    )
    await request(outsider, 'POST', `invitations/${expired.invitation.id}/accept`, {}, 409)
    const revoked = await invite(admin, enterpriseId, 'outsider@example.test')
    await request(owner, 'PUT', `spaces/${enterpriseId}/members/${admin.user.id}`, {
      role: 'member',
    })
    await request(outsider, 'POST', `invitations/${revoked.invitation.id}/accept`, {}, 403)
    assert.equal((await invitations.findById(revoked.invitation.id)).status, 'pending')
    assert.ok(!(await users.findById(outsider.user.id)).memberships.length)
    await request(owner, 'PUT', `spaces/${enterpriseId}/members/${admin.user.id}`, {
      role: 'admin',
    })
    await request(
      owner,
      'PUT',
      `team/${teamId}`,
      { enterpriseId: new (apiRequire('mongoose').Types.ObjectId)().toString() },
      400,
    )
    await request(owner, 'PUT', `enterprise/${enterpriseId}`, {
      name: '已编辑企业',
      status: 'disabled',
    })
    await assert.rejects(policy.assertCanReadSpace(owner.user.id.toString(), teamId), /停用/)
    assert.equal((await request(owner, 'GET', 'spaces')).length, 1)
    await request(owner, 'PUT', `enterprise/${enterpriseId}`, { status: 'active' })
    const assetModel = connection.model('OrgSmokeAsset', AssetSchema, 'assets')
    const resource = await assetModel.create({
      name: '保留的素材',
      type: 'image',
      url: 'https://example.test/org-fixture.png',
      ownerId: new (apiRequire('mongoose').Types.ObjectId)(teamId),
      ownerType: 'team',
      visibility: 'team',
      enterpriseId: new (apiRequire('mongoose').Types.ObjectId)(enterpriseId),
      creatorId: owner.user.id,
      metadata: {},
    })
    await request(owner, 'DELETE', `team/${teamId}`)
    assert.equal((await teams.findById(teamId)).status, 'archived')
    assert.ok(await assetModel.findById(resource._id))
    await assert.rejects(policy.assertCanReadSpace(owner.user.id.toString(), teamId), /归档/)
    await request(owner, 'PUT', `team/${teamId}`, { status: 'active', name: '恢复团队' })
    const rollbackTarget = await register('rollback@example.test')
    const rollbackInvite = await invite(owner, enterpriseId, 'rollback@example.test')
    const InvitationService = apiRequire('./dist/modules/org/invitation.service').InvitationService
    const MembershipService = apiRequire('./dist/modules/org/membership.service').MembershipService
    const membershipService = app.get(MembershipService)
    const join = membershipService.joinInvitation.bind(membershipService)
    membershipService.joinInvitation = async (...args) => {
      await join(...args)
      throw new Error('测试：成员写入后中断')
    }
    await request(
      rollbackTarget,
      'POST',
      `invitations/${rollbackInvite.invitation.id}/accept`,
      {},
      500,
    )
    membershipService.joinInvitation = join
    assert.equal((await users.findById(rollbackTarget.user.id)).memberships.length, 0)
    assert.equal((await invitations.findById(rollbackInvite.invitation.id)).status, 'pending')
    assert.ok(app.get(InvitationService))
    await request(owner, 'PUT', `enterprise/${enterpriseId}/owner`, { targetUserId: admin.user.id })
    const switched = await request(owner, 'PUT', `enterprise/${enterpriseId}/switch`)
    owner.access_token = switched.access_token
    await request(owner, 'POST', `spaces/${enterpriseId}/leave`, {})
    assert.equal((await request(owner, 'GET', 'spaces')).length, 1)
    await request(owner, 'GET', `spaces/${enterpriseId}/members`, undefined, 403)
    assert.equal(
      (await users.findById(admin.user.id)).memberships.find((item) => !item.teamId).role,
      'owner',
    )
    const legacy = await register('legacy@example.test')
    await users.collection.updateOne(
      { _id: legacy.user.id },
      {
        $set: {
          memberships: [{ enterpriseId, teamId, role: 'member' }],
          currentEnterpriseId: enterpriseId,
        },
      },
    )
    await teams.collection.updateOne(
      { _id: new (apiRequire('mongoose').Types.ObjectId)(teamId) },
      { $set: { enterpriseId } },
    )
    const { migrateOrgObjectIds } = require('./migrate-org-objectids.cjs')
    assert.deepEqual(await migrateOrgObjectIds(connection), { users: 1, teams: 1, applied: false })
    assert.equal(
      typeof (await users.collection.findOne({ _id: legacy.user.id })).memberships[0].enterpriseId,
      'string',
    )
    assert.deepEqual(await migrateOrgObjectIds(connection, true), {
      users: 1,
      teams: 1,
      applied: true,
    })
    assert.deepEqual(await migrateOrgObjectIds(connection, true), {
      users: 0,
      teams: 0,
      applied: true,
    })
    await request(admin, 'PUT', `spaces/${teamId}/members/${legacy.user.id}`, { role: 'viewer' })
    await users.collection.updateOne(
      { _id: legacy.user.id },
      { $set: { currentEnterpriseId: 'invalid' } },
    )
    await assert.rejects(migrateOrgObjectIds(connection, true), /无效组织关联/)
    await users.collection.updateOne(
      { _id: legacy.user.id },
      { $unset: { currentEnterpriseId: '' } },
    )
    const quota = await register('quota@example.test')
    await Promise.all(
      ['额度一', '额度二'].map((name) => request(quota, 'POST', 'enterprise', { name })),
    )
    await request(quota, 'POST', 'enterprise', { name: '额度三' }, 400)
    await request(
      admin,
      'PUT',
      `enterprise/${enterpriseId}/owner`,
      { targetUserId: quota.user.id },
      400,
    )
    console.log(
      '真实 Mongo HTTP：创建、未注册邀请、并发幂等、角色 403、退出/移除、邀请终态、撤权、停用/恢复、软归档、故障回滚、所有权转移、创建额度、旧数据迁移、DTO 校验均通过',
    )

    if (browserModules) {
      const { chromium } = require(path.join(browserModules, 'playwright'))
      const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
      vite = await createServer({
        root: path.join(root, 'apps/web'),
        configFile: path.join(root, 'apps/web/vite.config.ts'),
        server: { port: 0, host: '127.0.0.1', proxy: { '/api': base } },
      })
      await vite.listen()
      const webBase = `http://127.0.0.1:${vite.httpServer.address().port}`
      browser = await chromium.launch({ channel: 'msedge', headless: true })
      const browserOwner = await register('browser-owner@example.test')
      const context = await browser.newContext()
      const seed = (context, account) =>
        context.addInitScript(
          (account) =>
            localStorage.setItem(
              'brand-flow-auth',
              JSON.stringify({
                state: {
                  isLoggedIn: true,
                  token: account.access_token,
                  user: {
                    id: account.user.id,
                    email: account.user.email,
                    name: account.user.profile.nickname,
                  },
                },
                version: 0,
              }),
            ),
          account,
        )
      await seed(context, browserOwner)
      const page = await context.newPage()
      await page.goto(`${webBase}/organization`)
      await page.getByRole('button', { name: '创建企业', exact: true }).click()
      await page.getByLabel('名称', { exact: true }).fill('浏览器企业')
      await page.getByRole('button', { name: /确\s*认/ }).click()
      await page.getByRole('heading', { name: '浏览器企业', exact: true }).waitFor()
      await page.getByRole('button', { name: '创建团队', exact: true }).click()
      await page.getByLabel('名称', { exact: true }).fill('浏览器团队')
      await page.getByRole('button', { name: /确\s*认/ }).click()
      await page.getByText('浏览器团队', { exact: true }).waitFor()
      await page.getByRole('button', { name: '管理团队', exact: true }).click()
      await page.getByRole('heading', { name: '浏览器团队 · 成员' }).waitFor()
      await page.getByRole('button', { name: '邀请成员', exact: true }).click()
      await page.getByLabel('成员邮箱', { exact: true }).fill('browser-member@example.test')
      await page.getByRole('button', { name: /确\s*认/ }).click()
      await page.getByRole('status').filter({ hasText: '邀请已创建' }).waitFor()
      const browserMember = await register('browser-member@example.test')
      const memberContext = await browser.newContext()
      await seed(memberContext, browserMember)
      const memberPage = await memberContext.newPage()
      await memberPage.goto(`${webBase}/invitations`)
      await memberPage.getByRole('button', { name: /接\s*受/ }).click()
      await memberPage.getByText('已接受', { exact: true }).waitFor()
      await memberPage.reload()
      await memberPage.getByText('已接受', { exact: true }).waitFor()
      await memberPage.goto(`${webBase}/organization`)
      await memberPage.getByText('浏览器团队', { exact: true }).waitFor()
      await memberPage.getByRole('button', { name: '进入空间', exact: true }).click()
      await memberPage.getByRole('status').filter({ hasText: '已切换至协作空间' }).waitFor()
      await memberPage.getByRole('button', { name: '管理团队', exact: true }).click()
      await memberPage.getByRole('heading', { name: '浏览器团队 · 成员' }).waitFor()
      assert.equal(
        await memberPage.getByRole('button', { name: '邀请成员', exact: true }).isDisabled(),
        true,
      )
      await page.reload()
      await page.getByRole('button', { name: '管理团队', exact: true }).click()
      await page.getByText('browser-member@example.test', { exact: true }).first().waitFor()
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: path.join(root, '.tmp/org-mobile.png'), fullPage: true })
      assert.ok(
        await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1),
        '组织页窄屏不应横向溢出',
      )
      await memberPage.setViewportSize({ width: 390, height: 844 })
      await memberPage.goto(`${webBase}/invitations`)
      await memberPage.getByText('已接受', { exact: true }).waitFor()
      assert.ok(
        await memberPage.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1),
        '邀请页窄屏不应横向溢出',
      )
      console.log(
        '真实 Edge UI：创建企业/团队、邀请未注册邮箱、注册后接受、进入团队、双方刷新一致、成员管理按钮禁用、390px 窄屏均通过',
      )
    }
  } finally {
    if (browser) await browser.close()
    if (vite) await vite.close()
    if (connection) {
      assert.equal(connection.name, dbName)
      await connection.dropDatabase()
    }
    if (app) await app.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
