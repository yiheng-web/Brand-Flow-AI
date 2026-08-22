import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('展示标题、说明和页面操作', () => {
    render(
      <PageHeader
        eyebrow="当前空间"
        title="品牌资产"
        description="管理当前空间可用的品牌内容"
        actions={<button type="button">上传内容</button>}
      />,
    )

    expect(screen.getByRole('heading', { name: '品牌资产' })).toBeTruthy()
    expect(screen.getByText('管理当前空间可用的品牌内容')).toBeTruthy()
    expect(screen.getByRole('button', { name: '上传内容' })).toBeTruthy()
  })
})
