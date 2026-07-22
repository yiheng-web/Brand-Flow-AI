import assert from 'node:assert/strict'
import test from 'node:test'

import { extractOpenAIText, getOpenAISettings } from './openai-config'

test('OpenAI 配置使用官方模型作为默认值', () => {
  const previous = {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    chatModel: process.env.OPENAI_MODEL_NAME,
    imageModel: process.env.IMAGE_MODEL,
    embeddingModel: process.env.EMBEDDING_MODEL_NAME,
  }

  process.env.OPENAI_API_KEY = 'test-key'
  delete process.env.OPENAI_BASE_URL
  delete process.env.OPENAI_MODEL_NAME
  delete process.env.IMAGE_MODEL
  delete process.env.EMBEDDING_MODEL_NAME

  try {
    assert.deepEqual(getOpenAISettings(), {
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      chatModel: 'gpt-5.6-terra',
      imageModel: 'gpt-image-2',
      embeddingModel: 'text-embedding-3-small',
    })
  } finally {
    for (const [key, value] of Object.entries({
      OPENAI_API_KEY: previous.apiKey,
      OPENAI_BASE_URL: previous.baseUrl,
      OPENAI_MODEL_NAME: previous.chatModel,
      IMAGE_MODEL: previous.imageModel,
      EMBEDDING_MODEL_NAME: previous.embeddingModel,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Responses API 内容块可以提取为纯文本', () => {
  assert.equal(
    extractOpenAIText([
      { type: 'output_text', text: '{"ok":' },
      { type: 'output_text', text: 'true}' },
    ]),
    '{"ok":\ntrue}',
  )
})
