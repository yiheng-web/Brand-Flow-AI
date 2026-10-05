import { Types } from 'mongoose'
import { WorkflowProcessor } from '../workflow/workflow.processor'
import { KnowledgeSchema } from './schemas/knowledge.schema'
import { KnowledgeItemSchema } from './schemas/knowledge-item.schema'

it('知识库归属与关联字段使用真正 ObjectId，空间唯一索引保留个人/组织边界', () => {
  for (const field of ['creatorId', 'enterpriseId'])
    expect(KnowledgeSchema.path(field).instance).toBe('ObjectId')
  for (const field of ['knowledgeId', 'creatorId', 'enterpriseId', 'assetId'])
    expect(KnowledgeItemSchema.path(field).instance).toBe('ObjectId')
  expect(KnowledgeSchema.indexes()).toEqual(
    expect.arrayContaining([
      [
        { spaceId: 1, creatorId: 1, name: 1 },
        expect.objectContaining({
          unique: true,
          partialFilterExpression: { spaceType: 'personal' },
        }),
      ],
      [
        { spaceId: 1, name: 1 },
        expect.objectContaining({
          unique: true,
          partialFilterExpression: { spaceType: { $in: ['team', 'enterprise'] } },
        }),
      ],
    ]),
  )
})

it('工作流合并保留全部强制与显式禁用项及来源，个人规则不能绕过企业约束', async () => {
  const enterpriseId = new Types.ObjectId().toString()
  const teamId = new Types.ObjectId().toString()
  const userId = new Types.ObjectId().toString()
  const knowledgeId = new Types.ObjectId()
  const items = Array.from({ length: 35 }, (_, index) => ({
    _id: new Types.ObjectId(),
    knowledgeId,
    spaceId: enterpriseId,
    spaceType: 'enterprise',
    title: `企业${index}`,
    content: index === 0 ? '品牌色: #00A862' : `完整规则${index}`,
    constraintLevel: 'required',
  }))
  items.push({
    _id: new Types.ObjectId(),
    knowledgeId,
    spaceId: teamId,
    spaceType: 'team',
    title: '禁用',
    content: 'Logo禁用: 拉伸',
    constraintLevel: 'recommended',
  })
  const find = jest.fn(() => ({ sort: jest.fn().mockResolvedValue(items) }))
  const processor = new WorkflowProcessor(
    null as never,
    null as never,
    null as never,
    { find } as never,
    null as never,
  )
  const workflow = {
    selectedKnowledgeBaseIds: [knowledgeId.toString()],
    spaceId: teamId,
    spaceType: 'team',
    entId: enterpriseId,
    userId,
  }
  const constraints = await processor['buildConstraintPackage'](workflow as never)
  expect(constraints.required).toHaveLength(36)
  expect(constraints.sources).toHaveLength(36)
  expect(constraints.sources[constraints.sources.length - 1]).toMatchObject({
    spaceType: 'team',
    spaceId: teamId,
  })
  expect(find).toHaveBeenCalledWith(
    expect.objectContaining({
      $or: expect.arrayContaining([
        { spaceId: teamId, enterpriseId: new Types.ObjectId(enterpriseId) },
        { spaceId: 'personal', creatorId: new Types.ObjectId(userId) },
      ]),
    }),
  )
  items.push({
    _id: new Types.ObjectId(),
    knowledgeId,
    spaceId: 'personal',
    spaceType: 'personal',
    title: '个人冲突',
    content: '品牌色: #000000',
    constraintLevel: 'recommended',
  })
  await expect(processor['buildConstraintPackage'](workflow as never)).rejects.toThrow(
    '企业强制规则',
  )
})
