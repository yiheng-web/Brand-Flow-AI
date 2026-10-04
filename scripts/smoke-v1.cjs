const { spawnSync } = require('node:child_process')
const path = require('node:path')
const mongo = process.argv[2]
const runtimeModules = process.argv[3]
if (!mongo || !runtimeModules)
  throw new Error(
    '用法：pnpm test:v1 mongodb://127.0.0.1:27018 <已安装playwright的node_modules绝对路径>；Redis6381须为专用测试实例',
  )
for (const [script, args] of [
  ['smoke-storage-v1.cjs', []],
  ['smoke-runtime-v1.cjs', [mongo]],
  ['smoke-workflow.cjs', [mongo, '6381']],
  ['smoke-workflow-browser.cjs', [mongo, runtimeModules]],
  ['smoke-workflow-browser.cjs', [mongo, runtimeModules, 'compose-preview']],
]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('PASS：V1全链路验收完成；模型为Demo，MinIO/S3真实环境联调另见发布清单')
