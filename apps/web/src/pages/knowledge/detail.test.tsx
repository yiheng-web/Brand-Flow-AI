import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import KnowledgeDetailPage from './detail'

const api = vi.hoisted(() => ({
  getKnowledgeById: vi.fn(),
  getKnowledgeItems: vi.fn(),
  createKnowledgeItem: vi.fn(),
  deleteKnowledgeItem: vi.fn(),
  updateKnowledgeItem: vi.fn(),
  previewKnowledgeImport: vi.fn(),
  confirmKnowledgeImport: vi.fn(),
  retryKnowledgeVectorSync: vi.fn(),
}))
vi.mock('@/api/knowledge', () => api)

const item = {
  _id: 'item',
  title: '品牌色',
  content: '必须保留蓝色',
  tags: [],
  sourceType: 'import',
  status: 'active',
  constraintLevel: 'required',
  metadata: { importBatchId: 'batch' },
}
const getComputedStyle = window.getComputedStyle.bind(window)
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/knowledge/kb']}>
      <Routes>
        <Route path="/knowledge/:id" element={<KnowledgeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('个人知识库维护', () => {
  beforeEach(() => {
    // jsdom 30 无法计算弹窗样式中的 calc/var；交互测试保留行内显隐及指针状态，不验证布局。
    const computeStyle = (element: Element) => {
      const layout = document.createElement('div')
      if (element instanceof HTMLElement || element instanceof SVGElement)
        layout.style.cssText = element.style.cssText
      for (const property of Array.from(layout.style)) {
        if (/calc\(|var\(/.test(layout.style.getPropertyValue(property)))
          layout.style.removeProperty(property)
      }
      return getComputedStyle(layout)
    }
    vi.spyOn(window, 'getComputedStyle').mockImplementation(computeStyle)
    vi.stubGlobal('getComputedStyle', computeStyle)
    vi.resetAllMocks()
    api.getKnowledgeById.mockResolvedValue({ _id: 'kb', name: '品牌规范' })
    api.getKnowledgeItems.mockResolvedValue([item])
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('显示级别和来源原文，归档时使用现有状态协议', async () => {
    api.updateKnowledgeItem.mockResolvedValue({ ...item, status: 'archived' })
    renderPage()
    expect(await screen.findByText('强制约束')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '查看原文与来源' }))
    expect(await screen.findByText('导入批次：batch')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('button', { name: '归档' }))
    await waitFor(() =>
      expect(api.updateKnowledgeItem).toHaveBeenCalledWith('kb', 'item', { status: 'archived' }),
    )
  })

  it('预览阶段不确认入库，失败保留同一批次供重试', async () => {
    const preview = {
      batchId: 'batch',
      items: [{ title: '蓝色', content: '蓝色', constraintLevel: 'required' }],
    }
    api.previewKnowledgeImport.mockResolvedValue(preview)
    api.confirmKnowledgeImport
      .mockRejectedValueOnce(new Error('暂时失败'))
      .mockResolvedValueOnce({ message: '已导入到知识库，语义向量未启用', vectorized: false })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /批量导入文本/ }))
    await userEvent.type(screen.getByPlaceholderText('粘贴需要导入的文本内容...'), '蓝色')
    await userEvent.click(screen.getByRole('button', { name: '解析并预览' }))
    expect(await screen.findByLabelText('规则 1 内容')).toBeTruthy()
    expect(api.confirmKnowledgeImport).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('确认导入'))
    await waitFor(() => expect(api.confirmKnowledgeImport).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('暂时失败')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByText('确认导入').closest('button')?.disabled).toBe(false),
    )
    await userEvent.click(screen.getByText('确认导入'))
    await waitFor(() => expect(api.confirmKnowledgeImport).toHaveBeenCalledTimes(2))
    expect(api.confirmKnowledgeImport.mock.calls).toEqual([
      ['kb', preview.batchId, preview.items],
      ['kb', preview.batchId, preview.items],
    ])
  })

  it('读取失败时允许重试', async () => {
    api.getKnowledgeById.mockRejectedValueOnce(new Error('加载失败'))
    renderPage()
    expect((await screen.findAllByText('加载失败')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByText('品牌规范')).toBeTruthy()
  })
})
