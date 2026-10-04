import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api'
import { createAuthEventSource } from '@/utils/sse'

vi.mock('antd', () => ({ message: { error: vi.fn() } }))

import { useAuthStore } from './useAuthStore'
import { useWorkflowStore } from './useWorkflowStore'
import { useUserStore } from './useUserStore'
import { useFlowStore } from './useFlowStore'

const auth = (id: string) => ({
  token: `token-${id}`,
  user: { id, name: id, email: `${id}@example.test` },
})
const fillSession = () => {
  useWorkflowStore.getState().setWorkflowId('workflow-a')
  useWorkflowStore.getState().setImageUrl('https://example.test/a?signature=private')
  useUserStore
    .getState()
    .setSpaces([{ id: 'enterprise-a', name: 'A空间', type: 'enterprise', description: '' }])
  useFlowStore.getState().setActiveNode('node-a')
}

describe('Web 会话隔离', () => {
  beforeEach(() => {
    useAuthStore.getState().logout()
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('旧账号 HTTP 成功响应在账号切换后被拒绝', async () => {
    useAuthStore.getState().setAuth(auth('a'))
    const request = apiClient.get('/test', {
      adapter: async (config) => {
        useAuthStore.getState().setAuth(auth('b'))
        return {
          config,
          data: { success: true, data: { imageUrl: 'a-secret' } },
          status: 200,
          statusText: 'OK',
          headers: {},
        }
      },
    })
    await expect(request).rejects.toThrow('会话已变化')
    expect(useAuthStore.getState().user?.id).toBe('b')
  })

  it('旧账号请求返回 401 不会退出新账号', async () => {
    useAuthStore.getState().setAuth(auth('a'))
    const request = apiClient.get('/test', {
      adapter: async (config) => {
        useAuthStore.getState().setAuth(auth('b'))
        throw { config, response: { status: 401 }, message: 'old-session' }
      },
    })
    await expect(request).rejects.toMatchObject({ message: 'old-session' })
    expect(useAuthStore.getState().user?.id).toBe('b')
    expect(useAuthStore.getState().isLoggedIn).toBe(true)
  })

  it('退出时终止旧账号 SSE 请求', () => {
    useAuthStore.getState().setAuth(auth('a'))
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    const connection = createAuthEventSource('/stream')
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal | undefined
    useAuthStore.getState().logout()
    expect(signal?.aborted).toBe(true)
    connection.close()
  })

  it('退出清空工作流、空间、画布及工作流持久化数据', () => {
    useAuthStore.getState().setAuth(auth('a'))
    fillSession()
    useAuthStore.getState().logout()
    expect(useWorkflowStore.getState().workflowId).toBeNull()
    expect(useWorkflowStore.getState().imageUrl).toBeNull()
    expect(useUserStore.getState().spaces).toEqual([])
    expect(useUserStore.getState().currentSpaceId).toBeNull()
    expect(useFlowStore.getState().activeNodeId).toBeNull()
    expect(localStorage.getItem('brand-flow-workflow')).toBeNull()
  })

  it('直接切换账号也不会继承 A 状态', () => {
    useAuthStore.getState().setAuth(auth('a'))
    fillSession()
    useAuthStore.getState().setAuth(auth('b'))
    expect(useWorkflowStore.getState().workflowId).toBeNull()
    expect(useUserStore.getState().currentSpaceId).toBeNull()
    expect(localStorage.getItem('brand-flow-workflow')).toBeNull()
  })

  it('同账号更新企业 token 保留工作流，但不持久化签名地址', () => {
    useAuthStore.getState().setAuth(auth('a'))
    fillSession()
    useAuthStore.getState().setToken('new-enterprise-token')
    expect(useWorkflowStore.getState().workflowId).toBe('workflow-a')
    expect(JSON.parse(localStorage.getItem('brand-flow-workflow')!)).toEqual({
      state: { workflowId: 'workflow-a' },
      version: 1,
    })
  })

  it('旧无账号归属缓存升级后丢弃，不能恢复旧签名 URL', async () => {
    localStorage.setItem(
      'brand-flow-workflow',
      JSON.stringify({
        state: {
          workflowId: 'old-a',
          imageUrl: 'secret-url',
          result: { finalImageUrl: 'secret-url' },
        },
        version: 0,
      }),
    )
    await useWorkflowStore.persist.rehydrate()
    expect(useWorkflowStore.getState().workflowId).toBeNull()
    expect(useWorkflowStore.getState().imageUrl).toBeNull()
    expect(useWorkflowStore.getState().result).toBeNull()
  })
})
