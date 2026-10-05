import { AuthorizationService } from '../org/authorization.service'
import { ConflictException } from '@nestjs/common'
import { Types } from 'mongoose'
import type { Model } from 'mongoose'
import { ingestDocument, removeKnowledgeVectors } from '@brand-flow/agent'
import { KnowledgeService } from './knowledge.service'
import { KnowledgeController } from './knowledge.controller'
import type { KnowledgeDocument } from './schemas/knowledge.schema'
import type { KnowledgeItemDocument } from './schemas/knowledge-item.schema'
import type { OrgService } from '../org/org.service'
import { Role } from '@/common/enums'

jest.mock('@brand-flow/agent', () => ({
  ingestDocument: jest.fn(),
  removeKnowledgeVectors: jest.fn(),
}))

describe('知识库导入与向量补偿', () => {
  const userId = new Types.ObjectId().toString()
  const knowledge = {
    _id: new Types.ObjectId(),
    creatorId: new Types.ObjectId(userId),
    spaceId: 'personal',
    spaceType: 'personal',
  }
  const stored = new Map<string, object>()
  const knowledgeModel = {
    findOne: jest.fn().mockResolvedValue(knowledge),
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
  }
  const itemModel = {
    findOneAndUpdate: jest.fn(
      async (filter: { importKey: string }, update: { $setOnInsert: object }) => {
        if (!stored.has(filter.importKey))
          stored.set(filter.importKey, { _id: new Types.ObjectId(), ...update.$setOnInsert })
        return stored.get(filter.importKey)
      },
    ),
    updateOne: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn(),
  }
  const service = new KnowledgeService(
    knowledgeModel as unknown as Model<KnowledgeDocument>,
    itemModel as unknown as Model<KnowledgeItemDocument>,
    {
      getAccessibleSpace: jest.fn().mockResolvedValue({ spaceType: 'personal', role: Role.OWNER }),
      authorization: new AuthorizationService({} as never, {} as never, {} as never),
    } as unknown as OrgService,
  )
  const payload = [
    { title: '品牌色', content: '必须使用蓝色', constraintLevel: 'required' as const },
  ]
  beforeEach(() => {
    jest.clearAllMocks()
    stored.clear()
    jest
      .mocked(ingestDocument)
      .mockResolvedValue({ success: true, chunks: 0, vectorized: false, skipped: true })
    jest.mocked(removeKnowledgeVectors).mockResolvedValue(undefined)
  })

  it('同用户重名返回业务 409', async () => {
    knowledgeModel.create.mockRejectedValueOnce({ code: 11000 })
    await expect(
      service.create(userId, { spaceId: 'personal', name: '品牌' }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('预览不写库；重复确认不新增 Mongo 条目；禁用向量提示真实结果', async () => {
    const preview = await service.previewImport(
      userId,
      knowledge._id.toString(),
      '[required] 必须使用蓝色',
    )
    expect(preview).toEqual(payload.map((item) => ({ ...item, title: item.content })))
    expect(itemModel.findOneAndUpdate).not.toHaveBeenCalled()
    const first = await service.importItems(userId, knowledge._id.toString(), 'batch', payload)
    await service.importItems(userId, knowledge._id.toString(), 'batch', payload)
    expect(stored.size).toBe(1)
    expect(first).toMatchObject({ imported: 1, vectorized: false, failed: false })
    expect(first.message).toContain('语义向量未启用')
  })

  it('向量失败保留 Mongo，并在相同批次重试成功且不重复入库', async () => {
    jest.mocked(ingestDocument).mockRejectedValueOnce(new Error('provider unavailable'))
    const failed = await service.importItems(userId, knowledge._id.toString(), 'batch', payload)
    expect(failed.failed).toBe(true)
    expect(stored.size).toBe(1)
    jest
      .mocked(ingestDocument)
      .mockResolvedValueOnce({ success: true, chunks: 1, vectorized: true })
    const retried = await service.importItems(userId, knowledge._id.toString(), 'batch', payload)
    expect(retried).toMatchObject({ failed: false, vectorized: true })
    expect(stored.size).toBe(1)
    expect(removeKnowledgeVectors).toHaveBeenCalledTimes(2)
    expect(itemModel.updateOne).toHaveBeenLastCalledWith(expect.anything(), {
      $set: { 'metadata.vectorSync': expect.objectContaining({ failed: false }) },
    })
  })

  it('部分成功后的同批次编辑不会插入重复条目', async () => {
    await service.importItems(userId, knowledge._id.toString(), 'batch', payload)
    await expect(
      service.importItems(userId, knowledge._id.toString(), 'batch', [
        { ...payload[0], content: '改为红色' },
      ]),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(stored.size).toBe(1)
  })

  it('Controller 只使用 JWT 用户，预览生成批次并确认传递条目', async () => {
    const controller = new KnowledgeController(service)
    const result = await controller.previewImport(
      { user: { sub: userId } },
      knowledge._id.toString(),
      { content: '[required] 蓝色' },
    )
    expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/)
    await controller.confirmImport({ user: { sub: userId } }, knowledge._id.toString(), result)
    expect(stored.size).toBe(1)
  })

  it('向量清理失败时不删除 Mongo 知识库和条目', async () => {
    jest.mocked(removeKnowledgeVectors).mockRejectedValueOnce(new Error('向量清理失败'))
    await expect(service.remove(userId, knowledge._id.toString())).rejects.toThrow('向量清理失败')
    expect(knowledgeModel.findByIdAndDelete).not.toHaveBeenCalled()
    expect(itemModel.deleteMany).not.toHaveBeenCalled()
  })
})
