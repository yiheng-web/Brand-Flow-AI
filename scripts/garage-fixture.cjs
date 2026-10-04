// 真实 Garage S3 兼容服务；只创建和删除带本任务标签的随机临时容器。
const { spawnSync } = require('node:child_process')
const { mkdirSync, writeFileSync, unlinkSync, rmdirSync } = require('node:fs')
const { resolve } = require('node:path')
const { randomBytes, randomUUID } = require('node:crypto')

const docker = (args, env) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', env: env ?? process.env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Docker ${args[0]} 失败，请检查Docker服务与镜像`)
  return result.stdout.trim()
}

async function startS3Fixture(accessKey, secretKey, bucket) {
  const name = `codex-brand-flow-v1-s3-${randomUUID()}`
  const directory = resolve(__dirname, '../.tmp', name)
  const config = resolve(directory, 'garage.toml')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    config,
    `metadata_dir = "/tmp/meta"
data_dir = "/tmp/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "0.0.0.0:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "${randomBytes(32).toString('hex')}"
[s3_api]
s3_region = "us-east-1"
api_bind_addr = "0.0.0.0:3900"
`,
    'utf8',
  )
  let id
  let closed = false
  const close = async () => {
    if (closed) return
    if (id) {
      const actual = docker(['inspect', '--format', '{{.Id}}', name])
      if (actual !== id) throw new Error('临时容器身份改变，拒绝删除')
      docker(['rm', '-f', id])
    }
    unlinkSync(config)
    rmdirSync(directory)
    closed = true
  }
  try {
    id = docker(
      [
        'run',
        '-d',
        '--name',
        name,
        '--label',
        'codex.task=brand-flow-v1',
        '-p',
        '127.0.0.1::3900',
        '--mount',
        `type=bind,source=${config},target=/etc/garage.toml,readonly`,
        '-e',
        'GARAGE_DEFAULT_ACCESS_KEY',
        '-e',
        'GARAGE_DEFAULT_SECRET_KEY',
        '-e',
        'GARAGE_DEFAULT_BUCKET',
        'dxflrs/garage:v2.3.0',
        '/garage',
        'server',
        '--single-node',
        '--default-bucket',
      ],
      {
        ...process.env,
        GARAGE_DEFAULT_ACCESS_KEY: accessKey,
        GARAGE_DEFAULT_SECRET_KEY: secretKey,
        GARAGE_DEFAULT_BUCKET: bucket,
      },
    )
    const port = Number(docker(['port', name, '3900/tcp']).split(':').pop())
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
      }).catch(() => undefined)
      if (response?.status === 403) return { port, close }
      await new Promise((done) => setTimeout(done, 200))
    }
    throw new Error('Garage测试服务启动超时')
  } catch (error) {
    await close()
    throw error
  }
}
module.exports = { startS3Fixture }
