// 使用现有 Playwright 和本机 Edge，验证任务恢复或参考创作闭环；不读取 .env。
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const apiRequire = Module.createRequire(path.join(root, 'apps/api/package.json'))
const webRequire = Module.createRequire(path.join(root, 'apps/web/package.json'))
const [mongoUri, runtimeModules] = process.argv.slice(2)
const createMode = process.argv[4] === 'create'
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(mongoUri ?? '') || !runtimeModules) {
  throw new Error(
    '用法：node scripts/smoke-workflow-browser.cjs mongodb://127.0.0.1:27018 <已有运行时的 node_modules 路径> [create]；Redis 6381 必须为专用临时实例',
  )
}
process.env.BRAND_FLOW_DEMO_MODE = 'true'
process.env.KNOWLEDGE_VECTOR_MODE = 'disabled'
apiRequire('reflect-metadata')
const { Module: NestModule, ValidationPipe } = apiRequire('@nestjs/common')
const { NestFactory } = apiRequire('@nestjs/core')
const { ConfigModule } = apiRequire('@nestjs/config')
const { MongooseModule, getConnectionToken } = apiRequire('@nestjs/mongoose')
const { BullModule } = apiRequire('@nestjs/bullmq')
const { Queue } = apiRequire('bullmq')
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith('@/') ? path.join(root, 'apps/api/dist', request.slice(2)) : request,
    ...args,
  )
}
const { AuthModule } = apiRequire('./dist/modules/auth/auth.module')
const { WorkflowModule } = apiRequire('./dist/modules/workflow/workflow.module')
const { AssetsModule } = apiRequire('./dist/modules/assets/assets.module')
const { WorksModule } = apiRequire('./dist/modules/works/works.module')
const { StorageService } = apiRequire('./dist/modules/storage/storage.service')
const { TransformInterceptor } = apiRequire('./dist/common/interceptors/transform.interceptor')
const { AllExceptionsFilter } = apiRequire('./dist/common/filters/all-exceptions.filter')
const { WORKFLOW_QUEUE } = apiRequire('./dist/modules/workflow/workflow.constants')
Module._resolveFilename = resolve
const agentRequire = Module.createRequire(path.join(root, 'packages/agent/package.json'))
const core = agentRequire('./dist/v1-workflow')
const originalBrief = core.createCreativeBrief

async function main() {
  const dbName = `codex_workflow_browser_${Date.now()}`
  const queue = new Queue(WORKFLOW_QUEUE, { connection: { host: '127.0.0.1', port: 6381 } })
  let ownsQueue = false
  let app
  let vite
  let browser
  try {
    assert.equal(
      await queue.getJobCountByTypes('waiting', 'active', 'completed', 'failed', 'delayed'),
      0,
    )
    ownsQueue = true
    class SmokeApp {}
    NestModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: randomUUID(),
              MINIO_ENDPOINT: '127.0.0.1',
              MINIO_ACCESS_KEY: randomUUID(),
              MINIO_SECRET_KEY: randomUUID(),
              MINIO_BUCKET: 'smoke',
            }),
          ],
        }),
        MongooseModule.forRoot(mongoUri, { dbName }),
        BullModule.forRoot({ connection: { host: '127.0.0.1', port: 6381 } }),
        AuthModule,
        WorkflowModule,
        ...(createMode ? [AssetsModule, WorksModule] : []),
      ],
    })(SmokeApp)
    app = await NestFactory.create(SmokeApp, { logger: ['error'] })
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new TransformInterceptor())
    app.useGlobalFilters(new AllExceptionsFilter())
    app.setGlobalPrefix('api')
    if (createMode) {
      // 注册表无法提供 MinIO 时使用对象存储替身；业务 Controller/Service 与读写字节链路保持真实。
      const objects = new Map()
      const links = new Map()
      const storage = app.get(StorageService)
      storage.client.send = async (command) => {
        const input = command.input
        if (command.constructor.name === 'PutObjectCommand') {
          objects.set(input.Key, { bytes: Buffer.from(input.Body), contentType: input.ContentType })
          return {}
        }
        if (command.constructor.name === 'DeleteObjectCommand') {
          objects.delete(input.Key)
          return {}
        }
        assert.equal(command.constructor.name, 'GetObjectCommand')
        const object = objects.get(input.Key)
        assert.ok(object, `对象不存在：${input.Key}`)
        const bytes = input.Range
          ? object.bytes.subarray(0, Number(input.Range.split('-')[1]) + 1)
          : object.bytes
        return {
          ContentType: object.contentType,
          Body: { transformToByteArray: async () => bytes },
        }
      }
      storage.getSignedUrl = async (key, options) => {
        const token = randomUUID()
        links.set(token, { key, downloadName: options?.downloadName })
        return `http://127.0.0.1:3088/__smoke_objects/${token}`
      }
      app
        .getHttpAdapter()
        .getInstance()
        .get('/__smoke_objects/:token', (req, res) => {
          const link = links.get(req.params.token)
          const object = link && objects.get(link.key)
          if (!object) return res.status(404).end()
          if (link.downloadName)
            res.setHeader(
              'Content-Disposition',
              `attachment; filename*=UTF-8''${encodeURIComponent(link.downloadName)}`,
            )
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.type(object.contentType).send(object.bytes)
        })
    }
    await app.listen(3088, '127.0.0.1')
    const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
    vite = await createServer({
      root: path.join(root, 'apps/web'),
      server: {
        host: '127.0.0.1',
        port: 5189,
        strictPort: true,
        proxy: { '/api': { target: 'http://127.0.0.1:3088', changeOrigin: true } },
      },
    })
    await vite.listen()
    const { chromium } = require(path.join(runtimeModules, 'playwright'))
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const password = `${randomUUID()}aA1!`
    const email = `workflow-${randomUUID()}@example.test`
    const request = async (route, body, token) => {
      const result = await fetch(`http://127.0.0.1:3088/api/${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      assert.equal(result.ok, true, `HTTP ${result.status}: ${route}`)
      return (await result.json()).data
    }
    await request('auth/register', { email, password, nickname: '任务恢复验收' })
    const login = await request('auth/login', { email, password })
    const authState = {
      state: {
        isLoggedIn: true,
        token: login.access_token,
        user: { id: login.user.id, name: '任务恢复验收', email },
      },
      version: 0,
    }
    const createSession = async () => {
      const context = await browser.newContext()
      await context.addInitScript(
        (auth) => localStorage.setItem('brand-flow-auth', JSON.stringify(auth)),
        authState,
      )
      return { context, page: await context.newPage() }
    }
    if (createMode) {
      const token = login.access_token
      const generated = await core.generateCandidates({
        imagePrompt: '测试素材',
        selectedDirectionId: 'test',
        generationConfig: { width: 512, height: 512 },
      })
      const png = Buffer.from(generated[0].imageUrl.split(',')[1], 'base64')
      const upload = async (name) => {
        const form = new FormData()
        form.append('file', new Blob([png], { type: 'image/png' }), 'reference.png')
        for (const [key, value] of Object.entries({
          name,
          type: 'image',
          ownerId: login.user.id,
          ownerType: 'user',
          visibility: 'private',
        }))
          form.append(key, value)
        const response = await fetch('http://127.0.0.1:3088/api/assets/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
        assert.equal(response.ok, true, await response.clone().text())
        return (await response.json()).data
      }
      const product = await upload('产品参考原图')
      const logo = await upload('Logo 原图')
      const otherEmail = `other-${randomUUID()}@example.test`
      await request('auth/register', { email: otherEmail, password, nickname: '隔离验收' })
      const otherLogin = await request('auth/login', { email: otherEmail, password })
      const foreign = await fetch('http://127.0.0.1:3088/api/workflows/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherLogin.access_token}`,
        },
        body: JSON.stringify({
          prompt: '外来素材',
          spaceId: 'personal',
          references: [{ assetId: product._id, role: 'product' }],
        }),
      })
      assert.equal(foreign.status, 404)
      const knowledge = await request(
        'knowledge',
        { spaceId: 'personal', name: '本轮知识源' },
        token,
      )
      await request(
        `knowledge/${knowledge._id}/items`,
        { title: '品牌蓝色', content: '品牌主色必须为蓝色', constraintLevel: 'required' },
        token,
      )
      const resolved = await request(
        'workflows/create',
        {
          prompt: '验证素材溯源',
          spaceId: 'personal',
          references: [
            { assetId: product._id, role: 'product' },
            { assetId: logo._id, role: 'logo' },
          ],
        },
        token,
      )
      assert.equal(resolved.references[1].strategy, 'compose_logo')
      assert.equal(resolved.references[0].assetId, product._id)
      const session = await createSession()
      const getDetail = async (id) =>
        (
          await (
            await fetch(`http://127.0.0.1:3088/api/workflows/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).json()
        ).data
      const until = async (predicate) => {
        for (let index = 0; index < 200; index++) {
          if (await predicate()) return
          await new Promise((done) => setTimeout(done, 100))
        }
        throw new Error('工作流状态等待超时')
      }
      const sizes = []
      for (const ratio of ['1:1', '16:9']) {
        const page = session.page
        await page.goto('http://127.0.0.1:5189/')
        await page.getByRole('textbox').first().fill(`纯图片咖啡产品 ${ratio}`)
        await page.getByRole('button', { name: '选择知识库' }).click()
        await page.getByRole('button', { name: /本轮知识源/ }).click()
        await page.getByRole('button', { name: /^完\s*成$/ }).click()
        await page.getByRole('button', { name: /^参考素材/ }).click()
        await page.getByLabel('参考素材 产品参考原图').check()
        await page.getByRole('button', { name: /^参考素材/ }).click()
        if (ratio !== '1:1') {
          await page.getByLabel('生成画面比例').click()
          await page.getByText(ratio, { exact: true }).last().click()
        }
        const created = page.waitForResponse(
          (response) =>
            response.url().endsWith('/workflow/create') && response.request().method() === 'POST',
        )
        await page.getByRole('button', { name: /开始创作/ }).click()
        const task = (await (await created).json()).data
        const started = page.waitForResponse((response) =>
          response.url().endsWith(`/workflow/${task.id}/start`),
        )
        await page.getByRole('button', { name: '运行工作流' }).click()
        await page.getByRole('button', { name: '不需要', exact: true }).click()
        await started
        await page.getByRole('button', { name: '确认 Brief', exact: true }).click()
        await page.getByRole('radio').first().check()
        await page.getByRole('button', { name: '确定创意方案', exact: true }).click()
        await page.getByRole('button', { name: '下载当前候选', exact: true }).waitFor()
        const detail = await getDetail(task.id)
        const candidates = detail.workflow.result.generate.candidates
        assert.equal(candidates.length, 4)
        assert.equal(detail.workflow.result.generate.selectedCandidateId, '')
        assert.equal(
          detail.workflow.result.brandConstraint.required[0].description,
          '品牌主色必须为蓝色',
        )
        assert.equal(detail.workflow.result.references[0].assetId, product._id)
        assert.match(detail.workflow.result.prompt.imagePrompt, /产品参考原图/)
        sizes.push(candidates[0].metadata.generationConfig.imageSize)
        for (const candidate of candidates)
          assert.ok(candidate.metadata.objectKey.endsWith(`/${candidate.id}.png`))
        const download = page.waitForEvent('download')
        await page.getByRole('button', { name: '下载当前候选', exact: true }).click()
        assert.ok((await download).suggestedFilename().endsWith('.png'))
        const savedResponse = page.waitForResponse(
          (response) => response.url().endsWith('/works') && response.request().method() === 'POST',
        )
        await page.getByRole('radio').first().click()
        await until(async () => (await getDetail(task.id)).workflow.status === 'completed')
        assert.equal((await getDetail(task.id)).workflow.result.finalEvaluation.passed, true)
        const saved = await savedResponse
        assert.equal(saved.ok(), true, await saved.text())
        await until(async () => {
          const response = await fetch('http://127.0.0.1:3088/api/works?spaceId=personal', {
            headers: { Authorization: `Bearer ${token}` },
          })
          assert.equal(response.ok, true, await response.clone().text())
          return (await response.json()).data.some((work) => work.workflowId === task.id)
        })
        await page.getByRole('button', { name: '下载 PNG', exact: true }).waitFor()
        const [exportResponse, finalDownload] = await Promise.all([
          page.waitForResponse((response) => /\/works\/[^/]+\/export$/.test(response.url())),
          page.waitForEvent('download'),
          page.getByRole('button', { name: '下载 PNG', exact: true }).click(),
        ])
        assert.equal(exportResponse.ok(), true)
        const exportResult = (await exportResponse.json()).data
        const exportImage = await fetch(exportResult.downloadUrl)
        assert.equal(exportImage.ok, true)
        assert.ok(finalDownload.suggestedFilename().endsWith('.png'))
        assert.deepEqual(
          Buffer.from(await exportImage.arrayBuffer()).subarray(0, 8),
          png.subarray(0, 8),
        )
        if (ratio === '16:9')
          await request(
            `workflows/${task.id}/optimize`,
            {
              instruction: '背景改为夜景',
              categories: ['color'],
              sourceCandidateId: candidates[0].id,
            },
            token,
          )
        else await request(`workflows/${task.id}/nodes/generate/run`, {}, token)
        await until(
          async () => (await getDetail(task.id)).workflow.awaitingAction === 'select_candidate',
        )
        const rerun = (await getDetail(task.id)).workflow.result.generate.candidates
        assert.equal(
          rerun[0].metadata.generationConfig.imageSize,
          candidates[0].metadata.generationConfig.imageSize,
        )
        assert.equal(
          rerun.some((candidate) =>
            candidates.some((old) => old.metadata.objectKey === candidate.metadata.objectKey),
          ),
          false,
        )
      }
      assert.deepEqual(sizes, ['1024x1024', '1280x720'])
      await session.context.close()
      console.log(
        'PASS：真实 Edge 首页选择知识与产品参考，1:1/16:9 三方向四候选、未选择候选下载、纯图最终质检及作品保存、正式导出、优化比例保持和跨版本对象键隔离；对象存储使用替身，模型使用 Demo',
      )
      return
    }
    const task = await request(
      'workflows/create',
      { prompt: '跨设备恢复咖啡海报', spaceId: 'personal' },
      login.access_token,
    )
    core.createCreativeBrief = async (...args) => {
      await new Promise((done) => setTimeout(done, 1500))
      return originalBrief(...args)
    }
    const first = await createSession()
    await first.page.goto(`http://127.0.0.1:5189/workspace?workflowId=${task.id}`)
    await first.page.getByRole('button', { name: '运行工作流' }).waitFor()
    await first.page.getByRole('button', { name: '运行工作流' }).click()
    const started = first.page.waitForResponse(
      (response) =>
        response.url().endsWith(`/workflows/${task.id}/start`) ||
        response.url().endsWith(`/workflow/${task.id}/start`),
    )
    await first.page.getByRole('button', { name: '不需要', exact: true }).click()
    await started
    await first.context.close()
    const second = await createSession()
    await second.page.goto('http://127.0.0.1:5189/tasks')
    await second.page.getByRole('heading', { name: '跨设备恢复咖啡海报' }).waitFor()
    await second.page.getByRole('button', { name: '继续创作' }).click()
    await second.page.getByRole('button', { name: '确认 Brief', exact: true }).waitFor()
    await second.page.reload()
    await second.page.getByRole('button', { name: '确认 Brief', exact: true }).waitFor()
    const workflowCache = await second.page.evaluate(() =>
      localStorage.getItem('brand-flow-workflow'),
    )
    if (workflowCache)
      assert.deepEqual(Object.keys(JSON.parse(workflowCache).state), ['workflowId'])
    await second.page.goto('http://127.0.0.1:5189/tasks')
    await second.page.getByRole('button', { name: '取消任务' }).click()
    await second.page.getByText('已取消', { exact: true }).waitFor()
    assert.equal(await second.page.getByRole('button', { name: '继续创作' }).count(), 0)
    await second.page.getByRole('button', { name: '查看任务' }).click()
    await second.page.getByText('cancelled', { exact: true }).waitFor()
    assert.equal(await second.page.getByRole('button', { name: '从此节点重跑' }).isEnabled(), false)
    await second.context.close()
    console.log(
      'PASS：真实 Edge 会话 A 启动后关闭，会话 B 无任务缓存从历史继续；刷新恢复 Brief；取消任务只读且不能重跑',
    )
  } finally {
    core.createCreativeBrief = originalBrief
    await browser?.close()
    await vite?.close()
    if (app) {
      const connection = app.get(getConnectionToken())
      assert.equal(connection.name, dbName)
      await app.close()
      const cleanupConnection = await apiRequire('mongoose')
        .createConnection(mongoUri, { dbName })
        .asPromise()
      try {
        await cleanupConnection.dropDatabase()
      } finally {
        await cleanupConnection.close()
      }
    }
    if (ownsQueue) await queue.obliterate({ force: true })
    await queue.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
