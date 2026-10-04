import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractSiliconFlowImageUrls,
  generateSiliconFlowImages,
  getSiliconFlowImageSettings,
  resolveImageGenerationConfig,
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
  const requests: Record<string, unknown>[] = []

  process.env.SILICONFLOW_API_KEY = 'siliconflow-test-key'
  process.env.SILICONFLOW_BASE_URL = 'https://siliconflow.example.com/v1/'
  process.env.IMAGE_MODEL = 'Kwai-Kolors/Kolors'
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    requests.push(requestBody)
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer siliconflow-test-key')
    return new Response(
      JSON.stringify({
        images: [{ url: `https://img/${requests.length}.png` }],
      }),
      { status: 200 },
    )
  }) as typeof fetch

  try {
    assert.equal(
      (
        await generateSiliconFlowImages({
          prompt: '品牌底图',
          count: 4,
          negativePrompt: '畸变',
          generationConfig: { aspectRatio: '16:9', seed: 10 },
        })
      ).length,
      4,
    )
    assert.equal(requestUrl, 'https://siliconflow.example.com/v1/images/generations')
    assert.equal(requestBody.model, 'Kwai-Kolors/Kolors')
    assert.equal(requests.length, 4)
    assert.equal(requestBody.batch_size, undefined)
    assert.equal(requestBody.image_size, '1280x720')
    assert.equal(requestBody.negative_prompt, '畸变')
    assert.deepEqual(
      requests.map((request) => request.seed),
      [10, 11, 12, 13],
    )
    assert.equal(requestBody.prompt, '品牌底图')
    await generateSiliconFlowImages({
      prompt: '品牌底图',
      count: 1,
      generationConfig: { aspectRatio: '1:1', seed: 20 },
    })
    assert.equal(requests[4].image_size, '1024x1024')
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
    new Response(JSON.stringify({ images: [] }), {
      status: 200,
    })) as typeof fetch

  try {
    await assert.rejects(
      generateSiliconFlowImages({ prompt: '品牌底图', count: 4 }),
      /返回 0 张图片，期望 1 张/,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.SILICONFLOW_API_KEY
    else process.env.SILICONFLOW_API_KEY = previousKey
  }
})

test('比例映射和显式尺寸保留，未知组合不降级为正方形', () => {
  assert.equal(resolveImageGenerationConfig({ aspectRatio: '1:1' }).imageSize, '1024x1024')
  assert.equal(resolveImageGenerationConfig({ aspectRatio: '16:9' }).imageSize, '1280x720')
  assert.equal(
    resolveImageGenerationConfig({ aspectRatio: '16:9' }, 'Qwen/Qwen-Image').imageSize,
    '1664x928',
  )
  assert.equal(
    resolveImageGenerationConfig({ width: 1280, height: 720, seed: 1 }).imageSize,
    '1280x720',
  )
  assert.throws(
    () => resolveImageGenerationConfig({ aspectRatio: '16:9', width: 1024, height: 1024 }),
    /比例不一致/,
  )
  assert.throws(
    () => resolveImageGenerationConfig({ aspectRatio: '4:5' }, 'Qwen/Qwen-Image'),
    /不支持/,
  )
  assert.throws(() => resolveImageGenerationConfig({ width: 1024 }), /同时指定/)
  assert.throws(() => resolveImageGenerationConfig({ seed: -1 }), /seed/)
})
