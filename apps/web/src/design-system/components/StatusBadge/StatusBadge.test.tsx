import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusBadge, type SemanticStatus } from './StatusBadge'

describe('StatusBadge', () => {
  it('历史未知状态回退为待配置且不抛出异常', () => {
    render(<StatusBadge status={'legacy_pending' as SemanticStatus} />)

    expect(screen.getByLabelText('待配置')).toBeTruthy()
  })
})
