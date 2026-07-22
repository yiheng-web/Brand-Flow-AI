import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractSiliconFlowImageUrls,
  generateSiliconFlowImages,
  getSiliconFlowImageSettings,
} from './siliconflow-image-client'

test('解析 SiliconFlow 图片 URL 并忽略非法项', () => {
  assert.deepEqual(
    extractSiliconFlowImageUrls({ images: [{ url: 'https://img/1.png' }, {}, null] }),
    ['https://img/1.png'],
  )
})

test('SiliconFlow 缺少独立密钥时立即失败', () => {
  const previous = process.env.SILICONFLOW_API_KEY
  delete process.env.SILICONFLOW_API_KEY
  try {
    assert.throws(() => getSiliconFlowImageSettings(), /SILICONFLOW_API_KEY 未配置/)
  } finally {
    if (previous !== undefined) process.env.SILICONFLOW_API_KEY = previous
  }
})

test('SiliconFlow 使用独立凭据并严格请求四候选', async () => {
  const previous = {
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseUrl: process.env.SILICONFLOW_BASE_URL,
    model: process.env.IMAGE_MODEL,
    fetch: globalThis.fetch,
  }
  let requestUrl = ''
  let requestBody: Record<string, unknown> = {}

  process.env.SILICONFLOW_API_KEY = 'siliconflow-test-key'
  process.env.SILICONFLOW_BASE_URL = 'https://siliconflow.example.com/v1/'
  process.env.IMAGE_MODEL = 'Kwai-Kolors/Kolors'
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer siliconflow-test-key')
    return new Response(
      JSON.stringify({
        images: [1, 2, 3, 4].map((index) => ({ url: `https://img/${index}.png` })),
      }),
      { status: 200 },
    )
  }) as typeof fetch

  try {
    assert.equal((await generateSiliconFlowImages({ prompt: '品牌底图', count: 4 })).length, 4)
    assert.equal(requestUrl, 'https://siliconflow.example.com/v1/images/generations')
    assert.equal(requestBody.model, 'Kwai-Kolors/Kolors')
    assert.equal(requestBody.batch_size, 4)
    assert.equal(requestBody.prompt, '品牌底图')
  } finally {
    globalThis.fetch = previous.fetch
    for (const [key, value] of Object.entries({
      SILICONFLOW_API_KEY: previous.apiKey,
      SILICONFLOW_BASE_URL: previous.baseUrl,
      IMAGE_MODEL: previous.model,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('SiliconFlow 未严格返回请求数量时拒绝假成功', async () => {
  const previousKey = process.env.SILICONFLOW_API_KEY
  const previousFetch = globalThis.fetch
  process.env.SILICONFLOW_API_KEY = 'siliconflow-test-key'
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ images: [{ url: 'https://img/1.png' }] }), {
      status: 200,
    })) as typeof fetch

  try {
    await assert.rejects(
      generateSiliconFlowImages({ prompt: '品牌底图', count: 4 }),
      /返回 1 张图片，期望 4 张/,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.SILICONFLOW_API_KEY
    else process.env.SILICONFLOW_API_KEY = previousKey
  }
})
