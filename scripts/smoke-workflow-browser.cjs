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
const composeMode = ['compose', 'compose-preview'].includes(process.argv[4])
const previewMode = process.argv[4] === 'compose-preview'
const createMode = process.argv[4] === 'create' || composeMode
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(mongoUri ?? '') || !runtimeModules) {
  throw new Error(
    '用法：node scripts/smoke-workflow-browser.cjs mongodb://127.0.0.1:27018 <已有运行时的 node_modules 路径> [create|compose|compose-preview]；Redis 6381 必须为专用临时实例',
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
const originalEvaluation = core.evaluateFinalImage

async function main() {
  const dbName = `codex_workflow_browser_${Date.now()}`
  const queue = new Queue(WORKFLOW_QUEUE, {
    prefix: dbName,
    connection: { host: '127.0.0.1', port: 6381 },
  })
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
        BullModule.forRoot({ prefix: dbName, connection: { host: '127.0.0.1', port: 6381 } }),
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
    const { createServer, preview } = await import(pathToFileURL(webRequire.resolve('vite')).href)
    const serverOptions = {
      host: '127.0.0.1',
      port: 5189,
      strictPort: true,
      proxy: { '/api': { target: 'http://127.0.0.1:3088', changeOrigin: true } },
    }
    if (previewMode) {
      const server = await preview({ root: path.join(root, 'apps/web'), preview: serverOptions })
      vite = {
        close: () =>
          new Promise((resolve, reject) =>
            server.httpServer.close((error) => (error ? reject(error) : resolve())),
          ),
      }
    } else {
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
    }
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
      if (composeMode) {
        const page = session.page
        const pageErrors = []
        let forceFailedEvaluation = true
        core.evaluateFinalImage = async (...args) => {
          const report = await originalEvaluation(...args)
          if (!forceFailedEvaluation) return report
          forceFailedEvaluation = false
          return {
            ...report,
            passed: false,
            totalScore: 50,
            deductions: [{ dimension: 'brandConsistency', points: 30, reason: '品牌一致性不足' }],
            suggestions: ['提高品牌一致性后继续优化'],
          }
        }
        page.on('pageerror', (error) => pageErrors.push(error.message))
        const complete = async (task, graphic, first) => {
          if (first) {
            await page.goto(`http://127.0.0.1:5189/workspace?workflowId=${task.id}`)
            await page.getByRole('button', { name: '运行工作流' }).click()
            await page.getByRole('button', { name: graphic ? /^需\s*要$/ : '不需要' }).click()
            await page.getByRole('button', { name: '确认 Brief', exact: true }).click()
            await page.getByRole('radio').first().check()
            await page.getByRole('button', { name: '确定创意方案', exact: true }).click()
          }
          await page.getByRole('button', { name: '下载当前候选', exact: true }).waitFor()
          const expectFailure = !graphic && first && forceFailedEvaluation
          await page.getByRole('radio').first().click()
          if (expectFailure) {
            await until(async () => {
              const detail = await getDetail(task.id)
              return (
                detail.workflow.status === 'awaiting_user' &&
                detail.workflow.result.finalEvaluation?.passed === false
              )
            })
            await page.getByText('质检未通过，当前结果不可交付').waitFor()
            await page.getByText('提高品牌一致性后继续优化').waitFor()
            assert.equal(
              await page.getByRole('button', { name: '下载 PNG', exact: true }).count(),
              0,
            )
            await page.getByRole('button', { name: '继续优化', exact: true }).first().click()
            await page.getByRole('radio').nth(1).click()
          }
          if (graphic) {
            await page.getByPlaceholder('输入需要生成的文字，支持换行').fill('夏日咖啡')
            await page
              .getByPlaceholder('期望的艺术字风格，例如：清爽冰感、圆润醒目、蓝白高光')
              .fill('清爽蓝色粗体')
            await page.getByRole('button', { name: /生成四个候选/ }).click()
            await page.getByRole('button', { name: '选择此艺术字', exact: true }).first().click()
            const drawButton = page.getByRole('button', { name: '开始框选', exact: true })
            await drawButton.waitFor()
            await until(async () => !(await drawButton.isDisabled()))
            await drawButton.click()
            const canvas = page.locator('[aria-label="图文合成画布"] canvas.upper-canvas')
            await canvas.scrollIntoViewIfNeeded()
            const bounds = await canvas.boundingBox()
            assert.ok(bounds && bounds.width > 0 && bounds.height > 0)
            await page.mouse.move(bounds.x + bounds.width * 0.1, bounds.y + bounds.height * 0.55)
            await page.mouse.down()
            await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.85, {
              steps: 12,
            })
            await page.mouse.up()
            await page.getByRole('button', { name: 'AI 计算放置方案', exact: true }).click()
            const [composition] = await Promise.all([
              page.waitForResponse(
                (response) =>
                  response.url().endsWith(`/workflow/${task.id}/composition`) &&
                  response.request().method() === 'PUT',
              ),
              page.getByRole('button', { name: '确认合成并生成 PNG', exact: true }).click(),
            ])
            assert.equal(composition.ok(), true, await composition.text())
          }
          await until(async () => (await getDetail(task.id)).workflow.status === 'completed')
          const detail = await getDetail(task.id)
          assert.equal(detail.workflow.result.finalEvaluation.passed, true)
          if (!graphic)
            assert.equal(detail.nodes.find((node) => node.type === 'compose').status, 'skipped')
          else
            assert.ok(
              detail.workflow.result.compose.layers.some(
                (layer) => layer.type === 'logo' && layer.assetId === logo._id,
              ),
            )
          await page.getByRole('button', { name: '下载 PNG', exact: true }).waitFor()
          await page.getByRole('button', { name: /^关\s*闭$/ }).click()
          return detail
        }
        const pure = await request(
          'workflows/create',
          {
            prompt: '纯图片咖啡',
            spaceId: 'personal',
            generationConfig: { width: 512, height: 512 },
          },
          token,
        )
        await complete(pure, false, true)
        const graphic = await request(
          'workflows/create',
          {
            prompt: '夏日咖啡海报',
            spaceId: 'personal',
            references: [{ assetId: logo._id, role: 'logo' }],
            generationConfig: { width: 512, height: 512 },
          },
          token,
        )
        await complete(graphic, true, true)
        let revisionSnapshot
        let revisionBytes
        let storedRevision
        const revisionModel = app.get(
          apiRequire('@nestjs/mongoose').getModelToken('WorkflowRevision'),
        )
        const snapshotContent = (value) =>
          JSON.parse(
            JSON.stringify(value, (key, field) =>
              ['imageUrl', 'finalImageUrl'].includes(key) ? undefined : field,
            ),
          )
        for (let index = 1; index <= 2; index++) {
          await page.getByRole('button', { name: '继续优化', exact: true }).click()
          await page
            .getByPlaceholder('例如：背景改成夜景，增加科技感')
            .fill(`第 ${index} 轮改为蓝色夜景`)
          const [optimized] = await Promise.all([
            page.waitForResponse((response) =>
              response.url().endsWith(`/workflow/${graphic.id}/optimize`),
            ),
            page.getByRole('button', { name: '保持品牌与主体并重新生成', exact: true }).click(),
          ])
          assert.equal(optimized.ok(), true, await optimized.text())
          assert.ok((await optimized.json()).data.revisionId)
          await until(
            async () =>
              (await getDetail(graphic.id)).workflow.awaitingAction === 'select_candidate',
          )
          await complete(graphic, true, false)
          const revisions = await (
            await fetch(`http://127.0.0.1:3088/api/workflows/${graphic.id}/revisions`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).json()
          assert.equal(revisions.success, true)
          assert.equal(revisions.data.length, index, JSON.stringify(revisions))
          if (index === 1) {
            revisionSnapshot = revisions.data[0]
            assert.equal(revisionSnapshot.status, 'completed')
            storedRevision = await revisionModel.findById(revisionSnapshot._id).lean()
            revisionBytes = Buffer.from(
              await (await fetch(revisionSnapshot.result.compose.finalImageUrl)).arrayBuffer(),
            )
          } else {
            assert.deepEqual(
              snapshotContent(
                revisions.data.find((revision) => revision._id === revisionSnapshot._id),
              ),
              snapshotContent(revisionSnapshot),
            )
            assert.deepEqual(
              await revisionModel.findById(revisionSnapshot._id).lean(),
              storedRevision,
            )
            assert.deepEqual(
              Buffer.from(
                await (await fetch(revisionSnapshot.result.compose.finalImageUrl)).arrayBuffer(),
              ),
              revisionBytes,
            )
          }
        }
        const works = await (
          await fetch('http://127.0.0.1:3088/api/works?spaceId=personal', {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json()
        const work = works.data.find((entry) => entry.workflowId === graphic.id)
        assert.ok(work)
        const workDetail = async () =>
          (
            await (
              await fetch(`http://127.0.0.1:3088/api/works/${work._id}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
            ).json()
          ).data
        const versions = (await workDetail()).versions
        assert.deepEqual(
          versions.map((version) => version.versionNo),
          [3, 2, 1],
        )
        assert.equal(new Set(versions.map((version) => version.objectKey)).size, 3)
        assert.ok(versions[0].sourceRevisionId && versions[1].sourceRevisionId)
        assert.equal(versions[0].feedback.instruction, '第 2 轮改为蓝色夜景')
        assert.equal(versions[1].feedback.instruction, '第 1 轮改为蓝色夜景')
        const another = await request(
          'workflows/create',
          {
            prompt: '并发版本验证底图',
            spaceId: 'personal',
            generationConfig: { width: 512, height: 512 },
          },
          token,
        )
        await complete(another, false, true)
        const pureWork = works.data.find((item) => item.workflowId === pure.id)
        const concurrent = await Promise.all(
          [graphic.id, another.id].map((workflowId) =>
            request(`works/${pureWork._id}/versions/from-workflow`, { workflowId }, token),
          ),
        )
        assert.deepEqual(concurrent.map((version) => version.versionNo).sort(), [2, 3])
        assert.equal(new Set(concurrent.map((version) => version.objectKey)).size, 2)
        await Promise.all(
          Array.from({ length: 4 }, () =>
            request(`works/${work._id}/versions/from-workflow`, { workflowId: graphic.id }, token),
          ),
        )
        assert.equal((await workDetail()).versions.length, 3)
        await page.goto(`http://127.0.0.1:5189/works/${work._id}`)
        await page.getByRole('combobox', { name: '对比版本' }).click()
        await page.locator('.ant-select-item-option').filter({ hasText: /^V1$/ }).click()
        await page.getByAltText('历史对比版本').waitFor()
        for (const version of versions) {
          await page.getByRole('button', { name: `V${version.versionNo}`, exact: true }).click()
          await page.getByAltText(`${work.title} V${version.versionNo}`).waitFor()
          const [download, response] = await Promise.all([
            page.waitForEvent('download'),
            page.waitForResponse((response) =>
              response.url().endsWith(`/versions/${version._id}/export`),
            ),
            page.getByRole('button', { name: '导出 PNG', exact: true }).click(),
          ])
          assert.equal(response.ok(), true)
          assert.ok(download.suggestedFilename().endsWith(`-V${version.versionNo}.png`))
          const exported = (await response.json()).data
          const bytes = Buffer.from(await (await fetch(exported.downloadUrl)).arrayBuffer())
          assert.deepEqual(bytes.subarray(0, 8), png.subarray(0, 8))
        }
        assert.deepEqual(pageErrors, [])
        await session.context.close()
        console.log(
          `PASS：${previewMode ? 'production preview' : '开发构建'}真实 Edge 质检失败不可交付并可继续、纯图 skipped、艺术字与 Logo 原图合成、两次优化三版本、Revision 与对象字节不可变、真实 Mongo 并发版本号、重复保存幂等及指定版本 PNG 下载；模型 Demo、对象存储替身`,
        )
        return
      }
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
    core.evaluateFinalImage = originalEvaluation
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
