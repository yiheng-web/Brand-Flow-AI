/**
 * 一键开发启动：Docker 依赖 → 检查 .env → 构建 agent → 并行 dev
 *
 * 使用：pnpm dev:all  或  pnpm start
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(rootDir, 'apps/api/.env');
const envExamplePath = resolve(rootDir, 'apps/api/.env.example');
const isWindows = process.platform === 'win32';

const PLACEHOLDER_KEYS = new Set(['', 'sk-xxxxxxx', 'sk-xxxxxxxx']);

const skipKeyCheck =
  process.argv.includes('--skip-key-check') ||
  process.env.DEV_SKIP_KEY_CHECK === '1';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWindows,
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** 解析 apps/api/.env（简单 KEY=VALUE，支持行尾 # 注释） */
function loadEnvFile(filePath) {
  const env = {};
  const content = readFileSync(filePath, 'utf8');

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    const inlineComment = value.indexOf(' #');
    if (inlineComment !== -1) {
      value = value.slice(0, inlineComment).trim();
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function ensureEnvFile() {
  if (!existsSync(envPath)) {
    if (!existsSync(envExamplePath)) {
      console.error('缺少 apps/api/.env，且未找到 apps/api/.env.example');
      process.exit(1);
    }

    copyFileSync(envExamplePath, envPath);
    console.log('已从 apps/api/.env.example 创建 apps/api/.env');
  }
}

function validateEnv() {
  const env = loadEnvFile(envPath);
  const apiKey = env.SILICONFLOW_API_KEY?.trim() ?? '';

  if (PLACEHOLDER_KEYS.has(apiKey)) {
    if (skipKeyCheck) {
      console.warn('');
      console.warn('      [跳过] SILICONFLOW_API_KEY 仍为占位符，仅启动 Web/API/数据库');
      console.warn('      AI 工作流（意图解析、生图）在配置密钥前无法使用');
      console.warn('');
      return env;
    }

    console.error('');
    console.error('请在 apps/api/.env 中配置有效的 SILICONFLOW_API_KEY');
    console.error('（不能使用 .env.example 中的占位符 sk-xxxxxxx）');
    console.error('');
    console.error('示例（SiliconFlow，与 .env.example 一致）：');
    console.error('  SILICONFLOW_API_KEY=sk-你的密钥');
    console.error('  SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1');
    console.error('  SILICONFLOW_CHAT_MODEL=Pro/moonshotai/Kimi-K2.6');
    console.error('');
    console.error('若暂时只需启动前后端做 UI 调试，可执行：');
    console.error('  pnpm dev:all -- --skip-key-check');
    console.error('');
    process.exit(1);
  }

  return env;
}

console.log('');
console.log('=== Brand-Flow AI 开发环境启动 ===');
console.log('');

console.log('[1/4] 启动 Docker 依赖（MongoDB + Redis）...');
run('node', ['scripts/dev-deps.mjs']);

console.log('');
console.log('[2/4] 检查 API 环境变量...');
ensureEnvFile();
const apiEnv = validateEnv();
console.log('      apps/api/.env 已就绪');

console.log('');
console.log('[3/4] 构建 @brand-flow/agent...');
run('pnpm', ['--filter', '@brand-flow/agent', 'build']);

console.log('');
console.log('[4/4] 启动 Web + API + Agent（watch）...');
console.log('      前端: http://localhost:5173');
console.log('      后端: http://localhost:3000/api');
console.log('');

run('pnpm', ['exec', 'turbo', 'run', 'dev'], {
  env: { ...process.env, ...apiEnv },
});
