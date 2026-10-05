import { AuthorizationService } from '../org/authorization.service'
import { Types } from 'mongoose'
import { WorksService } from './works.service'

describe('可信作品版本并发与来源去重', () => {
  const userId = new Types.ObjectId().toString()
  const workId = new Types.ObjectId()
  function setup() {
    const work = {
      _id: workId,
      creatorId: new Types.ObjectId(userId),
      spaceId: 'personal',
      versionCounter: 1,
      currentVersionNo: 1,
    }
    const records: Array<Record<string, unknown>> = [{ workId, versionNo: 1 }]
    const workModel = {
      findOne: jest.fn().mockResolvedValue(work),
      updateOne: jest.fn(async (_filter, update) => {
        if (update.$max)
          work.versionCounter = Math.max(work.versionCounter, update.$max.versionCounter)
        if (update.$set && update.$set.currentVersionNo > work.currentVersionNo)
          work.currentVersionNo = update.$set.currentVersionNo
      }),
      findOneAndUpdate: jest.fn(async () => ({ ...work, versionCounter: ++work.versionCounter })),
    }
    const versionModel = {
      findOne: jest.fn((filter) =>
        filter.sourceObjectKey
          ? Promise.resolve(
              records.find((record) => record.sourceObjectKey === filter.sourceObjectKey),
            )
          : {
              sort: async () =>
                [...records].sort((a, b) => Number(b.versionNo) - Number(a.versionNo))[0],
            },
      ),
      create: jest.fn(async (input) => {
        if (records.some((record) => record.sourceObjectKey === input.sourceObjectKey))
          throw Object.assign(new Error('duplicate'), { code: 11000 })
        const record = { ...input, _id: new Types.ObjectId() }
        records.push(record)
        return record
      }),
      deleteOne: jest.fn(),
    }
    const workflowModel = {
      findOne: jest.fn(async (filter) => ({
        _id: new Types.ObjectId(filter._id),
        spaceId: 'personal',
        status: 'completed',
        runVersion: 7,
        result: {
          compose: { objectKey: `workflows/${userId}/${filter._id}/runs/7/final.png` },
          finalEvaluation: { passed: true },
          prompt: { imagePrompt: '夜景' },
          revision: {
            id: new Types.ObjectId().toString(),
            round: 1,
            feedback: { instruction: '夜景' },
          },
        },
      })),
    }
    const storage = {
      getObject: jest
        .fn()
        .mockResolvedValue({ contentType: 'image/png', bytes: Buffer.from('png') }),
      uploadObject: jest.fn(),
      getSignedUrl: jest.fn().mockResolvedValue('signed'),
      deleteObject: jest.fn(),
    }
    const service = new WorksService(
      workModel as never,
      versionModel as never,
      {} as never,
      workflowModel as never,
      { find: () => ({ sort: async () => [] }) } as never,
      storage as never,
      {
        getAccessibleSpace: jest.fn(),
        authorization: new AuthorizationService({} as never, {} as never, {} as never),
      } as never,
    )
    return { service, records, work, storage, workflowModel, workModel }
  }
  it('并发不同来源分配不同版本号，最新指针不能被较早版本覆盖', async () => {
    const { service, records, work, workModel } = setup()
    const sources = [new Types.ObjectId().toString(), new Types.ObjectId().toString()]
    const result = await Promise.all(
      sources.map((id) => service.createTrustedVersion(userId, workId.toString(), id)),
    )
    expect(result.map((version) => version.versionNo).sort()).toEqual([2, 3])
    expect(new Set(records.map((record) => record.objectKey)).size).toBe(3)
    expect(work.currentVersionNo).toBe(3)
    expect(workModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: workId }),
      { $inc: { versionCounter: 1 } },
      { new: true },
    )
  })
  it('并发重复来源只保存一次，重复请求不追加历史版本', async () => {
    const { service, records, storage } = setup()
    const source = new Types.ObjectId().toString()
    const saved = await Promise.all(
      [1, 2, 3].map(() => service.createTrustedVersion(userId, workId.toString(), source)),
    )
    expect(new Set(saved.map((version) => version._id.toString())).size).toBe(1)
    expect(records.length).toBe(2)
    const copied = storage.uploadObject.mock.calls.length
    await service.createTrustedVersion(userId, workId.toString(), source)
    expect(storage.uploadObject.mock.calls.length).toBe(copied)
  })
  it('跨 Space 或未通过质检的来源不会上传或追加版本', async () => {
    const { service, storage, workflowModel } = setup()
    workflowModel.findOne.mockResolvedValueOnce({
      spaceId: 'other',
      status: 'completed',
      result: { finalEvaluation: { passed: true } },
    } as never)
    await expect(
      service.createTrustedVersion(userId, workId.toString(), new Types.ObjectId().toString()),
    ).rejects.toThrow('可信工作流')
    expect(storage.uploadObject).not.toHaveBeenCalled()
    workflowModel.findOne.mockResolvedValueOnce({
      spaceId: 'personal',
      status: 'awaiting_user',
      result: { finalEvaluation: { passed: false } },
    } as never)
    await expect(
      service.createTrustedVersion(userId, workId.toString(), new Types.ObjectId().toString()),
    ).rejects.toThrow('可信工作流')
    expect(storage.uploadObject).not.toHaveBeenCalled()
  })
})
