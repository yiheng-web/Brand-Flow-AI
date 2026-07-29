import type { Model } from 'mongoose'
import { Types } from 'mongoose'

import { Role } from '@/common/enums'
import type { OrgService } from '@/modules/org/org.service'

import { KnowledgeService } from './knowledge.service'
import type { KnowledgeDocument } from './schemas/knowledge.schema'
import type { KnowledgeItemDocument } from './schemas/knowledge-item.schema'

describe('KnowledgeService 个人空间', () => {
  const userId = new Types.ObjectId().toString()
  const sortMock = jest.fn().mockResolvedValue([])
  const populateMock = jest.fn(() => ({ sort: sortMock }))
  const findMock = jest.fn(() => ({ populate: populateMock }))
  const createMock = jest.fn(async (value: unknown) => value)
  const getAccessibleSpaceMock = jest.fn(async (_userId: string, spaceId: string) => {
    if (spaceId !== 'personal') throw new Error('空间不可访问')
    return { spaceId: 'personal', spaceType: 'personal' as const, role: Role.OWNER }
  })

  const service = new KnowledgeService(
    { find: findMock, create: createMock } as unknown as Model<KnowledgeDocument>,
    {} as Model<KnowledgeItemDocument>,
    { getAccessibleSpace: getAccessibleSpaceMock } as unknown as OrgService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('未加入企业时可以读取个人知识库', async () => {
    await expect(service.findAll(userId, 'personal')).resolves.toEqual([])

    expect(getAccessibleSpaceMock).toHaveBeenCalledWith(userId, 'personal')
    expect(findMock).toHaveBeenCalledWith({
      spaceId: 'personal',
      creatorId: new Types.ObjectId(userId),
    })
  })

  it('创建个人知识库时写入个人空间归属', async () => {
    await service.create(userId, {
      spaceId: 'personal',
      name: '个人品牌规范',
      description: '个人空间测试',
    })

    expect(createMock).toHaveBeenCalledWith({
      name: '个人品牌规范',
      description: '个人空间测试',
      pineconeNamespace: undefined,
      isRequired: false,
      spaceId: 'personal',
      spaceType: 'personal',
      enterpriseId: undefined,
      creatorId: new Types.ObjectId(userId),
    })
  })

  it('不可访问的团队空间仍然拒绝读取', async () => {
    await expect(service.findAll(userId, 'team-space')).rejects.toThrow('空间不可访问')
  })
})
