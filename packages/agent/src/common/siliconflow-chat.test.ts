import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSiliconFlowChatModel,
  extractChatText,
  getSiliconFlowChatSettings,
  prepareSiliconFlowVisionImage,
} from './siliconflow-chat'

test('SiliconFlow 文本与视觉默认使用 Kimi K2.6', () => {
  const previous = {
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseUrl: process.env.SILICONFLOW_BASE_URL,
    chatModel: process.env.SILICONFLOW_CHAT_MODEL,
    embeddingModel: process.env.SILICONFLOW_EMBEDDING_MODEL,
  }
  process.env.SILICONFLOW_API_KEY = 'siliconflow-test-key'
  delete process.env.SILICONFLOW_BASE_URL
  delete process.env.SILICONFLOW_CHAT_MODEL
  delete process.env.SILICONFLOW_EMBEDDING_MODEL

  try {
    assert.deepEqual(getSiliconFlowChatSettings(), {
      apiKey: 'siliconflow-test-key',
      baseUrl: 'https://api.siliconflow.cn/v1',
      chatModel: 'Pro/moonshotai/Kimi-K2.6',
      embeddingModel: 'BAAI/bge-m3',
    })
    const model = createSiliconFlowChatModel()
    assert.equal(model.model, 'Pro/moonshotai/Kimi-K2.6')
    assert.equal(model.useResponsesApi, false)
  } finally {
    for (const [key, value] of Object.entries({
      SILICONFLOW_API_KEY: previous.apiKey,
      SILICONFLOW_BASE_URL: previous.baseUrl,
      SILICONFLOW_CHAT_MODEL: previous.chatModel,
      SILICONFLOW_EMBEDDING_MODEL: previous.embeddingModel,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Chat Completions 内容可以提取为纯文本', () => {
  assert.equal(extractChatText('直接文本'), '直接文本')
  assert.equal(
    extractChatText([
      { type: 'text', text: '{"ok":' },
      { type: 'text', text: 'true}' },
    ]),
    '{"ok":\ntrue}',
  )
})

test('本地 MinIO 图片转换为经过校验的 Data URL', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(Uint8Array.from([137, 80, 78, 71]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })) as typeof fetch
  try {
    assert.equal(
      await prepareSiliconFlowVisionImage('http://127.0.0.1:9000/brand-flow/final.png'),
      'data:image/png;base64,iVBORw==',
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('公网视觉图片 URL 不经过后端下载', async () => {
  assert.equal(
    await prepareSiliconFlowVisionImage('https://s3.siliconflow.cn/a.png'),
    'https://s3.siliconflow.cn/a.png',
  )
})
