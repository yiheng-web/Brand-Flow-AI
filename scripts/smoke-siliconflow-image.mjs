import { readFile } from 'node:fs/promises'

function parseEnv(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

async function main() {
  const env = parseEnv(await readFile('apps/api/.env', 'utf8'))
  if (!env.SILICONFLOW_API_KEY) throw new Error('apps/api/.env 缺少 SILICONFLOW_API_KEY')

  const baseUrl = (env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SILICONFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.IMAGE_MODEL || 'Kwai-Kolors/Kolors',
      prompt: '纯蓝色极简品牌背景，无文字，无标志，正方形构图',
      image_size: env.IMAGE_SIZE || '1024x1024',
      batch_size: 1,
      num_inference_steps: Number(env.IMAGE_NUM_INFERENCE_STEPS || 20),
      guidance_scale: Number(env.IMAGE_GUIDANCE_SCALE || 7.5),
    }),
    signal: AbortSignal.timeout(Number(env.IMAGE_GENERATION_TIMEOUT_MS || 120000)),
  })
  const payload = await response.json().catch(() => null)
  const images = Array.isArray(payload?.images) ? payload.images : []
  console.log(
    JSON.stringify({
      status: response.status,
      requestId: response.headers.get('x-request-id'),
      model: env.IMAGE_MODEL || 'Kwai-Kolors/Kolors',
      imageCount: images.length,
      imageHost: typeof images[0]?.url === 'string' ? new URL(images[0].url).host : '',
      error:
        typeof payload?.message === 'string'
          ? payload.message.slice(0, 200)
          : typeof payload?.error?.message === 'string'
            ? payload.error.message.slice(0, 200)
            : '',
    }),
  )
  if (!response.ok || images.length !== 1) process.exitCode = 1
}

main().catch((error) => {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : '未知错误',
      cause: cause?.message || '',
      code: cause && 'code' in cause && typeof cause.code === 'string' ? cause.code : '',
    }),
  )
  process.exitCode = 1
})
