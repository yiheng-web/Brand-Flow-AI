const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '..')
const apiRequire = Module.createRequire(path.join(root, 'apps/api/package.json'))
const webRequire = Module.createRequire(path.join(root, 'apps/web/package.json'))
const [mongoUri, browserModules] = process.argv.slice(2)
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):27019\/?$/.test(mongoUri ?? '') || !browserModules)
  throw new Error('需要专用 Mongo27019 副本集与 Playwright 模块目录')
apiRequire('reflect-metadata')
const { Module: NestModule, ValidationPipe } = apiRequire('@nestjs/common')
const { NestFactory } = apiRequire('@nestjs/core')
const { ConfigModule } = apiRequire('@nestjs/config')
const { MongooseModule, getConnectionToken, getModelToken } = apiRequire('@nestjs/mongoose')
const { JwtModule } = apiRequire('@nestjs/jwt')
const { PassportModule } = apiRequire('@nestjs/passport')
const { BullModule, getQueueToken } = apiRequire('@nestjs/bullmq')
process.env.BRAND_FLOW_DEMO_MODE = 'true'
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
const load = (name, file) => apiRequire(`./dist/modules/${file}`)[name]
const OrgModule = load('OrgModule', 'org/org.module')
const TasksModule = load('TasksModule', 'tasks/tasks.module')
const TasksOperationsService = load('TasksOperationsService', 'tasks/tasks-operations.service')
const AuthService = load('AuthService', 'auth/auth.service')
const JwtStrategy = load('JwtStrategy', 'auth/guards/jwt.strategy')
const WorkflowService = load('WorkflowService', 'workflow/workflow.service')
const WorkflowProcessor = load('WorkflowProcessor', 'workflow/workflow.processor')
const StorageService = load('StorageService', 'storage/storage.service')
const WorksModule = load('WorksModule', 'works/works.module')
const KnowledgeModule = load('KnowledgeModule', 'knowledge/knowledge.module')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
Module._resolveFilename = resolve

async function main() {
  const dbName = `codex_tasks_${Date.now()}_${randomUUID().slice(0, 8)}`
  const secret = randomUUID()
  let app, connection, vite, browser, s3Fixture, queue
  try {
    const { startS3Fixture } = require('./garage-fixture.cjs')
    const access = `GK${randomUUID().replaceAll('-', '')}`
    const storageSecret = randomUUID()
    s3Fixture = await startS3Fixture(access, storageSecret, 'v3-tasks')
    class SmokeApp {}
    NestModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: secret,
              REDIS_HOST: '127.0.0.1',
              REDIS_PORT: 6381,
              MINIO_ENDPOINT: '127.0.0.1',
              MINIO_PORT: s3Fixture.port,
              MINIO_ACCESS_KEY: access,
              MINIO_SECRET_KEY: storageSecret,
              MINIO_BUCKET: 'v3-tasks',
            }),
          ],
        }),
        MongooseModule.forRoot(mongoUri, { dbName, directConnection: true }),
        OrgModule,
        TasksModule,
        WorksModule,
        KnowledgeModule,
        BullModule.forRoot({ prefix: dbName, connection: { host: '127.0.0.1', port: 6381 } }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      providers: [AuthService, JwtStrategy],
    })(SmokeApp)
    app = await NestFactory.create(SmokeApp, { logger: ['error'] })
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new TransformInterceptor())
    app.useGlobalFilters(new AllExceptionsFilter())
    await app.listen(0, '127.0.0.1')
    connection = app.get(getConnectionToken())
    queue = app.get(getQueueToken('workflow'))
    const model = (name) => app.get(getModelToken(name))
    await Promise.all(
      ['User', 'Enterprise', 'Team', 'Task', 'AuditLog', 'Notification'].map((name) =>
        model(name).init(),
      ),
    )
    const auth = app.get(AuthService)
    const password = randomUUID()
    const actors = {}
    for (const role of ['owner', 'admin', 'member', 'viewer', 'outsider']) {
      const email = `${role}@example.test`
      await auth.register({ email, password, nickname: role })
      actors[role] = await auth.login({ email, password })
      actors[role].id = (await model('User').findOne({ email })).id
    }
    const request = async (actor, method, route, body, expected) => {
      const response = await fetch(`${await app.getUrl()}/api/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${actor.access_token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const result = await response.json()
      assert.equal(
        response.status,
        expected ?? (method === 'POST' ? 201 : 200),
        `${method} ${route}: ${JSON.stringify(result)}`,
      )
      return result.data
    }
    const enterprise = await request(actors.owner, 'POST', 'org/enterprise', {
      name: 'Task 验收企业',
    })
    const team = await request(actors.owner, 'POST', 'org/team', {
      enterpriseId: enterprise._id,
      name: '设计团队',
    })
    const teamId = team._id
    for (const role of ['admin', 'member', 'viewer'])
      await model('User').updateOne(
        { _id: actors[role].id },
        {
          $set: {
            memberships: [
              { enterpriseId: enterprise._id, role },
              { enterpriseId: enterprise._id, teamId, role },
            ],
          },
        },
      )
    const input = {
      teamId,
      title: '新品品牌海报',
      deadline: '2020-01-01T00:00:00Z',
      requirementSnapshot: { prompt: '新品品牌海报', needsComposition: false },
    }
    await request(actors.member, 'POST', 'tasks', input, 403)
    await request(actors.viewer, 'POST', 'tasks', input, 403)
    let task = await request(actors.owner, 'POST', 'tasks', {
      ...input,
      requestId: randomUUID(),
      creatorId: actors.outsider.id,
      status: 'completed',
    })
    assert.equal(task.creatorId, actors.owner.id)
    assert.equal(task.status, 'draft')
    assert.equal(task.overdue, true)
    await request(actors.outsider, 'GET', `tasks/${task.id}?teamId=${teamId}`, undefined, 403)
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/assign`,
      { teamId, version: task.version, assigneeId: actors.viewer.id },
      400,
    )
    task = await request(actors.admin, 'POST', `tasks/${task.id}/assign`, {
      teamId,
      version: task.version,
      assigneeId: actors.member.id,
    })
    const notifications = await request(actors.member, 'GET', 'org/notifications')
    assert.ok(
      notifications.some(
        (notification) =>
          notification.resourceId === task.id && notification.action === 'task.assign',
      ),
    )
    await request(
      actors.viewer,
      'POST',
      `tasks/${task.id}/accept`,
      { teamId, version: task.version },
      403,
    )
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/accept`,
      { teamId, version: task.version },
      403,
    )
    task = await request(actors.member, 'POST', `tasks/${task.id}/decline`, {
      teamId,
      version: task.version,
      reason: '需要重新安排',
    })
    assert.equal(task.status, 'draft')
    assert.equal(task.assigneeId, undefined)
    assert.equal(task.declineReason, '需要重新安排')
    task = await request(actors.owner, 'POST', `tasks/${task.id}/assign`, {
      teamId,
      version: task.version,
      assigneeId: actors.member.id,
    })
    task = await request(actors.member, 'POST', `tasks/${task.id}/accept`, {
      teamId,
      version: task.version,
    })
    assert.equal(task.status, 'accepted')
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/cancel`,
      { teamId, version: task.version - 1 },
      409,
    )
    const mine = await request(
      actors.member,
      'GET',
      `tasks?teamId=${teamId}&view=mine&deadline=overdue`,
    )
    assert.equal(mine.items[0].id, task.id)
    const events = await request(actors.viewer, 'GET', `tasks/${task.id}/timeline?teamId=${teamId}`)
    assert.deepEqual(
      events.map((event) => event.action),
      ['task.created', 'task.assign', 'task.decline', 'task.assign', 'task.accept'],
    )
    assert.equal(events[2].metadata.reason, '需要重新安排')
    const operations = app.get(TasksOperationsService)
    const retryBody = {
      ...input,
      title: '截止提醒与创建幂等',
      deadline: new Date(Date.now() + 7200000).toISOString(),
      requestId: randomUUID(),
    }
    const duplicates = await Promise.all([
      request(actors.owner, 'POST', 'tasks', retryBody),
      request(actors.owner, 'POST', 'tasks', retryBody),
    ])
    assert.equal(duplicates[0].id, duplicates[1].id)
    assert.equal(
      await model('AuditLog').countDocuments({
        action: 'task.created',
        resourceId: duplicates[0].id,
      }),
      1,
    )
    await request(actors.owner, 'POST', 'tasks', { ...retryBody, title: '不同内容' }, 409)
    await request(actors.owner, 'POST', `tasks/${duplicates[0].id}/assign`, {
      teamId,
      version: duplicates[0].version,
      assigneeId: actors.member.id,
    })
    await operations.tick()
    await operations.tick()
    assert.equal(
      await model('Notification').countDocuments({
        resourceId: duplicates[0].id,
        recipientId: actors.member.id,
        action: 'task.deadline_approaching',
      }),
      1,
    )
    assert.equal(
      await model('Notification').countDocuments({
        resourceId: task.id,
        recipientId: actors.member.id,
        action: 'task.overdue',
      }),
      1,
    )
    const managerDashboard = await request(actors.owner, 'GET', `tasks/dashboard?teamId=${teamId}`)
    assert.equal(managerDashboard.manager.pending, 1)
    assert.equal(managerDashboard.manager.inProgress, 1)
    assert.equal(managerDashboard.manager.overdue, 1)
    const memberDashboard = await request(actors.member, 'GET', `tasks/dashboard?teamId=${teamId}`)
    assert.equal(memberDashboard.mine.todo, 2)
    assert.equal(memberDashboard.manager, undefined)
    assert.equal(
      (await request(actors.viewer, 'GET', `tasks/dashboard?teamId=${teamId}`)).manager,
      undefined,
    )
    await request(actors.outsider, 'GET', `tasks/dashboard?teamId=${teamId}`, undefined, 403)
    const memberNotifications = await request(actors.member, 'GET', 'org/notifications')
    const readable = memberNotifications.find((item) => item.action === 'task.deadline_approaching')
    const unreadBefore = (await request(actors.member, 'GET', 'org/notifications/unread-count'))
      .count
    await request(actors.outsider, 'PUT', `org/notifications/${readable._id}/read`, {}, 404)
    await request(actors.member, 'PUT', `org/notifications/${readable._id}/read`, {})
    await request(actors.member, 'PUT', `org/notifications/${readable._id}/read`, {})
    assert.equal(
      (await request(actors.member, 'GET', 'org/notifications/unread-count')).count,
      unreadBefore - 1,
    )
    const departedCreator = await request(actors.admin, 'POST', 'tasks', {
      ...retryBody,
      requestId: randomUUID(),
      title: '创建者退出后的截止提醒',
    })
    await request(actors.owner, 'POST', `tasks/${departedCreator.id}/assign`, {
      teamId,
      version: departedCreator.version,
      assigneeId: actors.member.id,
    })
    const adminMemberships = (await model('User').findById(actors.admin.id)).memberships
    await model('User').updateOne({ _id: actors.admin.id }, { $set: { memberships: [] } })
    await operations.tick()
    assert.equal(
      await model('Notification').countDocuments({
        resourceId: departedCreator.id,
        recipientId: actors.member.id,
        action: 'task.deadline_approaching',
      }),
      1,
    )
    assert.equal(
      await model('Notification').countDocuments({
        resourceId: departedCreator.id,
        recipientId: actors.admin.id,
        action: 'task.deadline_approaching',
      }),
      0,
    )
    await model('User').updateOne(
      { _id: actors.admin.id },
      { $set: { memberships: adminMemberships } },
    )
    const foreign = await request(actors.outsider, 'POST', 'org/enterprise', { name: '外部企业' })
    const foreignTeam = await request(actors.outsider, 'POST', 'org/team', {
      enterpriseId: foreign._id,
      name: '外部团队',
    })
    await request(
      actors.outsider,
      'GET',
      `tasks/${task.id}?teamId=${foreignTeam._id}`,
      undefined,
      404,
    )
    const workflowService = app.get(WorkflowService)
    const enterpriseKnowledge = await request(actors.owner, 'POST', 'knowledge', {
      spaceId: enterprise._id,
      name: '企业强制知识',
      isRequired: true,
    })
    await request(actors.owner, 'POST', `knowledge/${enterpriseKnowledge._id}/items`, {
      title: '品牌规范',
      content: '保持品牌规范',
      constraintLevel: 'required',
    })
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/start`,
      { teamId, version: task.version },
      403,
    )
    task = await request(actors.member, 'POST', `tasks/${task.id}/start`, {
      teamId,
      version: task.version,
    })
    assert.equal(task.status, 'in_progress')
    const workflowId = task.activeWorkflowId
    assert.ok(workflowId)
    await request(
      actors.member,
      'POST',
      `tasks/${task.id}/start`,
      { teamId, version: task.version },
      409,
    )
    assert.equal(await model('Workflow').countDocuments({ taskId: task.id }), 1)
    const workflow = await model('Workflow').findById(workflowId)
    assert.equal(workflow.spaceId, teamId)
    assert.equal(workflow.taskId, task.id)
    assert.ok(workflow.selectedKnowledgeBaseIds.includes(enterpriseKnowledge._id))
    await request(
      actors.admin,
      'POST',
      `workflows/${workflowId}/start`,
      { needsComposition: false },
      403,
    )
    await request(
      actors.member,
      'POST',
      `workflows/${workflowId}/start`,
      { needsComposition: true },
      400,
    )
    const until = async (predicate) => {
      for (let attempt = 0; attempt < 300; attempt++) {
        const current = await model('Workflow').findById(workflowId)
        if (predicate(current)) return current
        assert.notEqual(current.status, 'failed', current.errorMessage)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error('Task 工作流执行超时')
    }
    await workflowService.start(workflowId, { needsComposition: false }, actors.member.id)
    await until((flow) => flow.awaitingAction === 'confirm_brief')
    await workflowService.confirmBrief(workflowId, actors.member.id)
    const directions = await until((flow) => flow.awaitingAction === 'select_direction')
    await workflowService.updateNodeOutput(
      workflowId,
      'creativeDirection',
      { selectedDirectionId: directions.result.creativeDirection.directions[0].id },
      actors.member.id,
    )
    const storage = app.get(StorageService)
    const importPng = storage.importRemotePng.bind(storage)
    storage.importRemotePng = async () => {
      throw new Error('验收注入：对象存储暂不可用')
    }
    await workflowService.runNode(workflowId, 'prompt', actors.member.id)
    await until((flow) => flow.status === 'failed')
    const failedTask = await request(actors.member, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    assert.equal(failedTask.status, 'in_progress')
    assert.equal(failedTask.activeWorkflowId, workflowId)
    assert.match(failedTask.progress.executionError, /对象存储暂不可用/)
    storage.importRemotePng = importPng
    await workflowService.retry(workflowId, actors.member.id)
    const generated = await until((flow) => flow.awaitingAction === 'select_candidate')
    await workflowService.updateNodeOutput(
      workflowId,
      'generate',
      { selectedCandidateId: generated.result.generate.candidates[0].id },
      actors.member.id,
    )
    await workflowService.runNode(workflowId, 'compose', actors.member.id)
    await until((flow) => flow.status === 'completed')
    const progressed = await request(actors.viewer, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    assert.equal(progressed.progress.status, 'completed')
    assert.equal(progressed.status, 'in_progress')
    const { preview } = await import(pathToFileURL(webRequire.resolve('vite')).href)
    vite = await preview({
      root: path.join(root, 'apps/web'),
      preview: { host: '127.0.0.1', port: 0, proxy: { '/api': await app.getUrl() } },
    })
    const { chromium } = require(path.join(browserModules, 'playwright'))
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    let page
    const webUrl = vite.resolvedUrls.local[0]
    const login = async (role) => {
      const context = await browser.newContext()
      await context.addInitScript(
        (account) =>
          localStorage.setItem(
            'brand-flow-auth',
            JSON.stringify({
              state: {
                isLoggedIn: true,
                token: account.access_token,
                user: {
                  id: account.id,
                  email: account.user.email,
                  name: account.user.profile.nickname,
                },
              },
              version: 0,
            }),
          ),
        actors[role],
      )
      page = await context.newPage()
    }
    const completedWorkflow = await model('Workflow').findById(workflowId)
    const work = await request(actors.member, 'POST', 'works', {
      title: '任务成果',
      spaceId: teamId,
      workflowId,
      finalImageUrl: completedWorkflow.result.finalImageUrl,
    })
    let options = await request(
      actors.member,
      'GET',
      `tasks/${task.id}/deliverables?teamId=${teamId}`,
    )
    assert.equal(options[0].workId, work._id)
    const submitBody = {
      teamId,
      version: task.version,
      workId: work._id,
      workVersionId: options[0].workVersionId,
      comment: '第一轮成果',
    }
    await request(actors.owner, 'POST', `tasks/${task.id}/submit`, submitBody, 403)
    await request(
      actors.member,
      'POST',
      `tasks/${task.id}/submit`,
      { ...submitBody, workVersionId: new (apiRequire('mongoose').Types.ObjectId)().toString() },
      404,
    )
    task = await request(actors.member, 'POST', `tasks/${task.id}/submit`, submitBody)
    assert.equal(task.status, 'reviewing')
    await request(
      actors.member,
      'POST',
      `tasks/${task.id}/review`,
      { teamId, version: task.version, submissionId: task.latestSubmissionId, decision: 'approve' },
      403,
    )
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/review`,
      {
        teamId,
        version: task.version,
        submissionId: task.latestSubmissionId,
        decision: 'reject',
        reason: ' ',
      },
      400,
    )
    task = await request(actors.owner, 'POST', `tasks/${task.id}/review`, {
      teamId,
      version: task.version,
      submissionId: task.latestSubmissionId,
      decision: 'reject',
      reason: '增强蓝色品牌氛围',
    })
    await model('Task').collection.updateOne(
      { _id: new (apiRequire('mongoose').Types.ObjectId)(task.id) },
      { $set: { status: 'in_progress', updatedAt: new Date(Date.now() - 600000) } },
    )
    await operations.reconcile()
    task = await request(actors.member, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    assert.equal(task.status, 'rejected')
    assert.equal(
      await model('AuditLog').countDocuments({
        action: 'task.resume_recovered',
        resourceId: task.id,
      }),
      1,
    )
    const optimize = workflowService.optimize.bind(workflowService)
    workflowService.optimize = async () => {
      throw new Error('验收注入：返修启动失败')
    }
    await request(
      actors.member,
      'POST',
      `tasks/${task.id}/resume`,
      { teamId, version: task.version },
      500,
    )
    task = await request(actors.member, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    assert.equal(task.status, 'rejected')
    workflowService.optimize = optimize
    task = await request(actors.member, 'POST', `tasks/${task.id}/resume`, {
      teamId,
      version: task.version,
    })
    const revised = await until((flow) => flow.awaitingAction === 'select_candidate')
    assert.equal(revised.result.revision.feedback.instruction, '增强蓝色品牌氛围')
    await workflowService.updateNodeOutput(
      workflowId,
      'generate',
      { selectedCandidateId: revised.result.generate.candidates[0].id },
      actors.member.id,
    )
    await workflowService.runNode(workflowId, 'compose', actors.member.id)
    await until((flow) => flow.status === 'completed')
    const secondVersion = await request(
      actors.member,
      'POST',
      `works/${work._id}/versions/from-workflow`,
      { workflowId },
    )
    assert.notEqual(secondVersion._id, submitBody.workVersionId)
    await login('member')
    await page.goto(`${webUrl}team-tasks/${task.id}?teamId=${teamId}`)
    await page.getByRole('combobox', { name: '提交成果版本' }).click()
    await page.getByText(`任务成果 · V${secondVersion.versionNo}`, { exact: true }).click()
    await page.getByLabel('提交说明').fill('按意见返修')
    await page.getByRole('button', { name: '提交成果', exact: true }).click()
    await page.getByText('审核中', { exact: true }).waitFor()
    task = await request(actors.member, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    await login('admin')
    await page.goto(`${webUrl}team-tasks/${task.id}?teamId=${teamId}`)
    await page.getByLabel('审核意见').fill('符合要求')
    await page.getByRole('button', { name: '审核通过', exact: true }).click()
    await page.getByText('已完成', { exact: true }).waitFor()
    task = await request(actors.admin, 'GET', `tasks/${task.id}?teamId=${teamId}`)
    assert.equal(task.status, 'completed')
    const rounds = await request(
      actors.viewer,
      'GET',
      `tasks/${task.id}/submissions?teamId=${teamId}`,
    )
    assert.deepEqual(
      rounds.map((submission) => [submission.round, submission.status]),
      [
        [1, 'rejected'],
        [2, 'approved'],
      ],
    )
    assert.equal(rounds[0].reviewComment, '增强蓝色品牌氛围')
    await request(
      actors.owner,
      'POST',
      `tasks/${task.id}/review`,
      { teamId, version: task.version, submissionId: rounds[0].id, decision: 'approve' },
      409,
    )
    await request(actors.member, 'DELETE', `works/${work._id}`, undefined, 409)
    let cancelledTask = await request(actors.owner, 'POST', 'tasks', {
      ...input,
      title: '取消隔离测试',
    })
    cancelledTask = await request(actors.owner, 'POST', `tasks/${cancelledTask.id}/assign`, {
      teamId,
      version: cancelledTask.version,
      assigneeId: actors.member.id,
    })
    cancelledTask = await request(actors.member, 'POST', `tasks/${cancelledTask.id}/accept`, {
      teamId,
      version: cancelledTask.version,
    })
    cancelledTask = await request(actors.member, 'POST', `tasks/${cancelledTask.id}/start`, {
      teamId,
      version: cancelledTask.version,
    })
    const cancelledWorkflowId = cancelledTask.activeWorkflowId
    const oldVersion = (await model('Workflow').findById(cancelledWorkflowId)).runVersion
    cancelledTask = await request(actors.owner, 'POST', `tasks/${cancelledTask.id}/cancel`, {
      teamId,
      version: cancelledTask.version,
    })
    const cancelledWorkflow = await model('Workflow').findById(cancelledWorkflowId)
    assert.equal(cancelledWorkflow.status, 'cancelled')
    assert.equal(cancelledWorkflow.runVersion, oldVersion + 1)
    await app.get(WorkflowProcessor).process({
      name: 'run-workflow',
      data: { workflowId: cancelledWorkflowId, runVersion: oldVersion },
    })
    assert.equal((await model('Workflow').findById(cancelledWorkflowId)).status, 'cancelled')
    await login('member')
    await page.goto(`${webUrl}team-tasks`)
    await page.getByRole('link', { name: '新品品牌海报' }).waitFor()
    await page.getByRole('link', { name: '新品品牌海报' }).click()
    await page.getByText('任务时间线', { exact: true }).waitFor()
    await page.getByRole('link', { name: '继续创作 / 查看结果' }).click()
    await page.getByRole('button', { name: '团队任务 · 返回详情' }).waitFor()
    await page
      .getByRole('dialog', { name: '本次创作已完成' })
      .getByRole('button', { name: /关\s*闭/ })
      .click()
    await page.getByRole('button', { name: '团队任务 · 返回详情' }).click()
    await page.reload()
    await page.getByText('任务时间线', { exact: true }).waitFor()
    await page.getByText('第 1 轮提交', { exact: true }).waitFor()
    await page.getByText('第 2 轮提交', { exact: true }).waitFor()
    await login('viewer')
    await page.goto(`${webUrl}team-tasks/${task.id}?teamId=${teamId}`)
    await page.getByText('任务时间线', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '取消任务', exact: true }).count(), 0)
    await page.goto(`${webUrl}notifications`)
    await page.getByRole('button', { name: '刷新通知' }).waitFor()
    const completedDashboard = await request(
      actors.owner,
      'GET',
      `tasks/dashboard?teamId=${teamId}`,
    )
    assert.equal(completedDashboard.manager.completedWeek, 1)
    console.log(
      'PASS：V3 五角色、幂等创建与截止提醒、仪表盘、异常对账、Mongo/Redis/S3 七节点 Demo、两轮提交审核、旧 worker 取消隔离、production Edge 工作台刷新与通知',
    )
  } finally {
    await browser?.close()
    if (vite)
      await new Promise((resolve, reject) =>
        vite.httpServer.close((error) => (error ? reject(error) : resolve())),
      )
    await queue?.obliterate({ force: true })
    if (connection) await connection.dropDatabase()
    await app?.close()
    await s3Fixture?.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
