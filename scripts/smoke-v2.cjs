const { spawnSync } = require('node:child_process')
const path = require('node:path')
const [mongo, browserModules] = process.argv.slice(2)
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1):27019\/?$/.test(mongo ?? '') || !browserModules)
  throw new Error(
    '用法：pnpm test:v2 mongodb://127.0.0.1:27019 <Playwright node_modules 路径>；Mongo 副本集和 Redis6381 必须为专用测试实例，Docker 须可用',
  )
for (const script of ['smoke-org.cjs', 'smoke-knowledge-org.cjs', 'smoke-collab-resources.cjs']) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, script), mongo, browserModules],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        COLLAB_REAL_STORAGE: 'true',
        BRAND_FLOW_DEMO_MODE: 'true',
        KNOWLEDGE_VECTOR_MODE: 'disabled',
      },
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(
  'PASS：V2 组织、知识、协作资源、审计、通知全链路；真实 Mongo/Redis/Garage S3/浏览器，模型 Demo',
)
