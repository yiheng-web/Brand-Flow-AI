import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ArtTextCandidate } from '@brand-flow/contracts'
import ArtTextComposer from './ArtTextComposer'

const state = vi.hoisted(() => ({
  canvases: [] as Array<{
    element: HTMLCanvasElement
    add: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>,
  images: [] as Array<{ url: string; signal?: AbortSignal; resolve: (value: unknown) => void }>,
  callbacks: [] as Array<() => void>,
  width: 800,
}))
vi.mock('@/api/workflow', () => ({
  createPlacementPlan: vi.fn(),
  generateArtTextCandidates: vi.fn(),
  saveComposition: vi.fn(),
  selectArtTextCandidate: vi.fn(),
}))
vi.mock('fabric', () => {
  class Shape {
    width = 100
    height = 60
    constructor(options = {}) {
      Object.assign(this, options)
    }
    set(options: object) {
      Object.assign(this, options)
      return this
    }
  }
  class Canvas {
    width = 800
    height = 120
    add = vi.fn()
    dispose = vi.fn(async () => true)
    constructor(public element: HTMLCanvasElement) {
      state.canvases.push(this)
    }
    getWidth() {
      return this.width
    }
    getHeight() {
      return this.height
    }
    setDimensions(size: { width: number; height: number }) {
      Object.assign(this, size)
    }
    sendObjectToBack = vi.fn()
    renderAll = vi.fn()
    on = vi.fn()
    off = vi.fn()
    cancelRequestedRender = vi.fn()
  }
  return {
    Canvas,
    StaticCanvas: Canvas,
    Rect: Shape,
    Group: Shape,
    Shadow: Shape,
    Gradient: Shape,
    Textbox: Shape,
    FabricImage: {
      fromURL: (url: string, options: { signal?: AbortSignal }) =>
        new Promise((resolve) => state.images.push({ url, signal: options.signal, resolve })),
    },
  }
})
const candidate: ArtTextCandidate = {
  id: 'text-a',
  textContent: '夏日咖啡',
  previewUrl: '',
  styleSummary: '蓝色',
  dominantColors: ['#fff'],
  source: 'demo',
  vectorSpec: { fontFamily: 'Arial', fontWeight: 700, textAlign: 'center', fill: '#fff' },
}
const draft = {
  baseCandidateId: 'base-a',
  textContent: '夏日咖啡',
  stylePrompt: '蓝色',
  candidates: [candidate],
  selectedArtTextCandidateId: 'text-a',
}
const props = {
  workflowId: 'workflow-a',
  baseCandidate: { id: 'base-a', imageUrl: 'image-a', prompt: '咖啡底图' },
  draft,
  onChanged: vi.fn(async () => {}),
}
beforeEach(() => {
  state.canvases.length = 0
  state.images.length = 0
  state.callbacks.length = 0
  state.width = 800
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: state.width,
    height: 120,
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: state.width,
    bottom: 120,
    toJSON: () => ({}),
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: () => void) {}
      observe(target: HTMLElement) {
        if (target.getAttribute('aria-label') === '图文合成画布')
          state.callbacks.push(this.callback)
      }
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('StrictMode 与 URL 切换使用不同 DOM canvas，旧图片结束不能写入新画布', async () => {
  const view = render(
    <StrictMode>
      <ArtTextComposer {...props} />
    </StrictMode>,
  )
  await waitFor(() => expect(state.canvases.length).toBe(2))
  expect(state.canvases[0].element).not.toBe(state.canvases[1].element)
  expect(state.images[0].signal?.aborted).toBe(true)
  await act(async () => state.images[0].resolve({ width: 512, height: 512, set: vi.fn() }))
  expect(state.canvases[0].add).not.toHaveBeenCalled()
  await act(async () => state.images[1].resolve({ width: 512, height: 512, set: vi.fn() }))
  expect(state.canvases[1].add).toHaveBeenCalledTimes(2)
  view.rerender(
    <StrictMode>
      <ArtTextComposer
        {...props}
        baseCandidate={{ id: 'base-b', imageUrl: 'image-b', prompt: '咖啡底图' }}
      />
    </StrictMode>,
  )
  await waitFor(() => expect(state.canvases.length).toBe(3))
  view.unmount()
  await act(async () => state.images[2].resolve({ width: 512, height: 512, set: vi.fn() }))
  expect(state.canvases[2].add).not.toHaveBeenCalled()
  expect(state.canvases.every((canvas) => canvas.dispose.mock.calls.length === 1)).toBe(true)
})
it('零尺寸容器不初始化，尺寸恢复后才加载，零尺寸图片明确报错', async () => {
  state.width = 0
  render(<ArtTextComposer {...props} />)
  expect(state.canvases).toHaveLength(0)
  state.width = 800
  act(() => state.callbacks[0]())
  expect(state.canvases).toHaveLength(1)
  await act(async () => state.images[0].resolve({ width: 0, height: 0, set: vi.fn() }))
  expect(await screen.findByText('底图尺寸无效')).toBeTruthy()
  expect(state.canvases[0].add).not.toHaveBeenCalled()
})
