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
  const mode = process.argv[2] || 'text'
  const env = parseEnv(await readFile('apps/api/.env', 'utf8'))
  if (!env.SILICONFLOW_API_KEY) throw new Error('apps/api/.env 缺少 SILICONFLOW_API_KEY')

  const model = env.SILICONFLOW_CHAT_MODEL || 'Pro/moonshotai/Kimi-K2.6'
  let content
  if (mode === 'text') {
    content = '仅回复 SILICONFLOW_OK'
  } else if (mode === 'vision') {
    const imagePath = process.argv[3]
    const imageUrl = imagePath
      ? `data:image/png;base64,${(await readFile(imagePath)).toString('base64')}`
      : 'https://www.python.org/static/community_logos/python-logo.png'
    content = [
      { type: 'text', text: '这张图片的主色是什么？只回复一种颜色。' },
      {
        type: 'image_url',
        image_url: { url: imageUrl },
      },
    ]
  } else {
    throw new Error(`未知冒烟模式: ${mode}`)
  }

  const baseUrl = (env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SILICONFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 128,
    }),
    signal: AbortSignal.timeout(120000),
  })
  const payload = await response.json().catch(() => null)
  const output = payload?.choices?.[0]?.message?.content
  console.log(
    JSON.stringify({
      mode,
      status: response.status,
      requestId: response.headers.get('x-request-id'),
      model: payload?.model || model,
      output: typeof output === 'string' ? output.slice(0, 120) : '',
      error:
        typeof payload?.message === 'string'
          ? payload.message.slice(0, 200)
          : typeof payload?.error?.message === 'string'
            ? payload.error.message.slice(0, 200)
            : '',
    }),
  )
  if (!response.ok || typeof output !== 'string') process.exitCode = 1
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
