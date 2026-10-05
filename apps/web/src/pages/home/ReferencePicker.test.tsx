import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReferencePicker from './ReferencePicker'
import { useUserStore } from '@/store/useUserStore'
const api = vi.hoisted(() => ({ getAssets: vi.fn() }))
vi.mock('@/api/assets', () => api)
const assets = Array.from({ length: 5 }, (_, index) => ({
  _id: `asset-${index}`,
  name: `产品${index}`,
  objectKey: 'server-key',
  mimeType: 'image/png',
  url: 'https://test.invalid/image.png',
}))
describe('个人参考素材选择', () => {
  beforeEach(() => {
    useUserStore.setState({ currentSpaceId: 'personal' })
    vi.clearAllMocks()
    api.getAssets.mockReset()
    api.getAssets.mockResolvedValue(assets)
  })
  afterEach(cleanup)
  it('组织参考素材查询当前团队，不回退到个人空间', async () => {
    useUserStore.setState({ currentSpaceId: 'team-test' })
    render(<ReferencePicker value={[]} onChange={vi.fn()} disabled={false} />)
    await screen.findByLabelText('参考素材 产品0')
    expect(api.getAssets).toHaveBeenCalledWith('team-test')
    expect(api.getAssets).not.toHaveBeenCalledWith('personal')
  })
  it('只查询个人上传图片，提交 ID 与用途，不提交地址', async () => {
    const onChange = vi.fn()
    render(<ReferencePicker value={[]} onChange={onChange} disabled={false} />)
    fireEvent.click(await screen.findByLabelText('参考素材 产品0'))
    expect(api.getAssets).toHaveBeenCalledWith('personal')
    expect(onChange).toHaveBeenCalledWith([{ assetId: 'asset-0', role: 'product' }])
    expect(screen.getByText(/Logo 保留原素材/)).toBeTruthy()
  })
  it('四项上限禁用其他素材，加载失败可重试', async () => {
    api.getAssets.mockRejectedValueOnce(new Error('素材加载失败'))
    render(
      <ReferencePicker
        value={assets.slice(0, 4).map((asset) => ({ assetId: asset._id, role: 'style' }))}
        onChange={vi.fn()}
        disabled={false}
      />,
    )
    await screen.findByText('素材加载失败')
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(((await screen.findByLabelText('参考素材 产品4')) as HTMLInputElement).disabled).toBe(
      true,
    )
  })
})
