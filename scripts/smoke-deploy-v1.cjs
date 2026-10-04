const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')
const { resolve } = require('node:path')
const { randomUUID, randomBytes } = require('node:crypto')
const { startS3Fixture } = require('./garage-fixture.cjs')
const apiRequire = createRequire(resolve(__dirname, '../apps/api/package.json'))
const docker = (args, env) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', env: env ?? process.env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Docker ${args[0]} 失败`)
  return result.stdout.trim()
}

async function main() {
  const name = `codex_v1_deploy_${randomUUID().replaceAll('-', '')}`
  const containers = []
  const access = `GK${randomBytes(16).toString('hex')}`
  const secret = randomBytes(32).toString('hex')
  const storage = await startS3Fixture(access, secret, 'deploy-test')
  let network
  try {
    network = docker(['network', 'create', '--label', 'codex.task=brand-flow-v1', name])
    const env = {
      ...process.env,
      JWT_SECRET: randomBytes(32).toString('hex'),
      MONGODB_URI: `mongodb://host.docker.internal:27018/${name}`,
      REDIS_HOST: 'host.docker.internal',
      REDIS_PORT: '6381',
      REDIS_QUEUE_PREFIX: name,
      MINIO_ENDPOINT: 'host.docker.internal',
      MINIO_PORT: String(storage.port),
      MINIO_ACCESS_KEY: access,
      MINIO_SECRET_KEY: secret,
      MINIO_BUCKET: 'deploy-test',
      BRAND_FLOW_DEMO_MODE: 'true',
      KNOWLEDGE_VECTOR_MODE: 'disabled',
      TRUST_PROXY_HOPS: '1',
    }
    const api = docker(
      [
        'run',
        '-d',
        '--name',
        `${name}-api`,
        '--network',
        name,
        '--network-alias',
        'api',
        '--label',
        'codex.task=brand-flow-v1',
        ...Object.keys(env)
          .filter((key) => !(key in process.env) || env[key] !== process.env[key])
          .flatMap((key) => ['-e', key]),
        'codex-brand-flow-api:v1-06',
      ],
      env,
    )
    containers.push(api)
    assert.equal(docker(['inspect', '--format', '{{.Config.User}}', api]), 'node')
    assert.equal(
      docker([
        'exec',
        api,
        'node',
        '-e',
        "require('node:assert/strict').notEqual(process.getuid(),0);require('node:assert/strict').equal(require('node:fs').existsSync('.env'),false);console.log('PASS')",
      ]),
      'PASS',
    )
    const web = docker([
      'run',
      '-d',
      '--name',
      `${name}-web`,
      '--network',
      name,
      '--label',
      'codex.task=brand-flow-v1',
      '-p',
      '127.0.0.1::80',
      'codex-brand-flow-web:v1-06',
    ])
    containers.push(web)
    const port = Number(docker(['port', web, '80/tcp']).split(':').pop())
    const base = `http://127.0.0.1:${port}`
    let ready = false
    for (let index = 0; index < 100; index++) {
      const response = await fetch(`${base}/health/ready`, {
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined)
      if (response?.status === 200) {
        ready = true
        break
      }
      await new Promise((done) => setTimeout(done, 300))
    }
    assert.ok(ready, 'API生产镜像必须通过真实依赖readiness')
    const spa = await fetch(`${base}/workspace`)
    assert.equal(spa.status, 200)
    assert.match(await spa.text(), /id="root"/)
    const post = async (route, body, token) => {
      const response = await fetch(`${base}/api/${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      assert.ok(response.ok, `生产接口 ${route}: ${response.status}`)
      return (await response.json()).data
    }
    const email = `${randomUUID()}@example.test`
    const password = `Aa1!${randomUUID()}`
    await post('auth/register', { email, password, nickname: '部署验收' })
    const login = await post('auth/login', { email, password })
    const workflow = await post(
      'workflows/create',
      { prompt: '部署SSE验收', spaceId: 'personal' },
      login.access_token,
    )
    const stream = await fetch(`${base}/api/workflows/${workflow.id}/stream`, {
      headers: { Authorization: `Bearer ${login.access_token}` },
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(stream.status, 200)
    assert.match(stream.headers.get('content-type'), /text\/event-stream/)
    const reader = stream.body.getReader()
    let received = ''
    while (!received.includes('workflow_snapshot')) {
      const chunk = await reader.read()
      assert.equal(chunk.done, false, 'SSE不能在快照前结束')
      received += Buffer.from(chunk.value).toString()
    }
    assert.match(received, /workflow_snapshot/)
    await reader.cancel()
    await storage.close()
    const unavailable = await fetch(`${base}/health/ready`)
    assert.equal(unavailable.status, 503)
    assert.equal((await fetch(`${base}/health/live`)).status, 200)
    console.log(
      'PASS：生产API/Web镜像真实启动、非root API、Mongo/Redis/Garage readiness、注册登录、SPA深链接、Nginx鉴权SSE即时快照、对象服务中断503',
    )
  } finally {
    for (const id of containers.reverse()) docker(['rm', '-f', id])
    if (network) docker(['network', 'rm', network])
    await storage.close()
    const connection = await apiRequire('mongoose')
      .createConnection('mongodb://127.0.0.1:27018', { dbName: name })
      .asPromise()
    assert.equal(connection.name, name)
    await connection.dropDatabase()
    await connection.close()
    const { Queue } = apiRequire('bullmq')
    const queue = new Queue('workflow', {
      prefix: name,
      connection: { host: '127.0.0.1', port: 6381 },
    })
    await queue.obliterate({ force: true })
    await queue.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
