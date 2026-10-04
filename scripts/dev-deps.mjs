import './check-node.mjs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const composeFile = resolve(rootDir, 'apps/api/docker-compose.yml')
const action = process.argv[2] === 'down' ? 'down' : 'up'
const isWindows = process.platform === 'win32'

const dockerCheck = spawnSync('docker', ['--version'], {
  stdio: 'ignore',
  shell: isWindows,
})

if (dockerCheck.error || dockerCheck.status !== 0) {
  console.error('Docker CLI was not found.')
  console.error(
    'Install/start Docker Desktop, or manually start these services before running the API:',
  )
  console.error('- MongoDB: localhost:27017')
  console.error('- Redis: localhost:6379')
  process.exit(1)
}

const args =
  action === 'down'
    ? ['compose', '-f', composeFile, 'down']
    : ['compose', '-f', composeFile, 'up', '-d']

const result = spawnSync('docker', args, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows,
})

process.exit(result.status ?? 1)
