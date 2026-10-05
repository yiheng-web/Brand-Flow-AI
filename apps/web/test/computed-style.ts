import { vi } from 'vitest'

const getComputedStyle = window.getComputedStyle.bind(window)
export function mockComputedStyle() {
  // 沿用知识库弹窗测试的处理：jsdom 30 不支持 calc/var，保留行内显隐及指针状态。
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
}
