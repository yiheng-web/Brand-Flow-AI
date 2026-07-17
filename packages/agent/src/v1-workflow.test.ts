import assert from 'node:assert/strict'
import test from 'node:test'

import {
  composeFinalImage,
  createCreativeBriefFallback,
  createDirectionFallbacks,
  ensureThreeDirections,
  parseCreativeBrief,
} from './v1-workflow'

test('CreativeBrief JSON 失败时返回结构化 fallback', () => {
  const result = parseCreativeBrief('not-json', '生成一张山水图')
  assert.equal(result.outputMode, 'pure_image')
  assert.equal(result.needsComposition, false)
  assert.equal(result.originalRequest, '生成一张山水图')
})

test('创意方向始终返回三个差异方案', () => {
  const brief = createCreativeBriefFallback('制作新品海报')
  const directions = ensureThreeDirections([], brief)
  assert.equal(directions.length, 3)
  assert.equal(new Set(directions.map((item) => item.visualStyle)).size, 3)
  assert.deepEqual(directions, createDirectionFallbacks(brief))
})

test('无需合成时保留原候选图并标记 skipped', () => {
  const brief = createCreativeBriefFallback('生成一张山水图')
  const result = composeFinalImage(
    { id: 'c1', imageUrl: 'https://example.com/a.png', prompt: '山水' },
    brief,
  )
  assert.equal(result.mode, 'skipped')
  assert.equal(result.finalImageUrl, 'https://example.com/a.png')
})
