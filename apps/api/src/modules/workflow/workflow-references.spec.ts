import { Types } from 'mongoose'
import { WorkflowReferencesService } from './workflow-references.service'

describe('个人参考素材解析', () => {
  const userId = new Types.ObjectId().toString()
  const assetId = new Types.ObjectId().toString()
  const objectKey = `assets/user/${userId}/${assetId}/original.png`
  const model = { findOne: jest.fn() }
  const storage = {
    getSignedUrl: jest.fn().mockResolvedValue('signed-server-url'),
    getObject: jest.fn().mockResolvedValue({ bytes: Buffer.from('png') }),
  }
  const service = new WorkflowReferencesService(model as never, storage as never)
  beforeEach(() => {
    jest.clearAllMocks()
    model.findOne.mockResolvedValue({ name: '产品原图', objectKey, mimeType: 'image/png' })
  })
  it('归属条件包含本人、个人私有空间，地址由服务端生成，执行时重新验证', async () => {
    const references = await service.resolve([{ assetId, role: 'product' }], userId)
    expect(model.findOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(assetId),
      creatorId: new Types.ObjectId(userId),
      ownerId: new Types.ObjectId(userId),
      ownerType: 'user',
      visibility: 'private',
    })
    expect(references[0]).toMatchObject({
      assetId,
      role: 'product',
      objectKey,
      imageUrl: 'signed-server-url',
      strategy: 'visual_constraints',
    })
    const execution = await service.forExecution(references, userId)
    expect(model.findOne).toHaveBeenCalledTimes(2)
    expect(execution[0].imageUrl).toMatch(/^data:image\/png;base64,/)
    expect(storage.getObject).toHaveBeenCalledWith(objectKey)
  })
  it('他人素材、任意外链、伪造存储键均拒绝，Logo 保留合成用途', async () => {
    model.findOne.mockResolvedValueOnce(null)
    await expect(service.resolve([{ assetId, role: 'product' }], userId)).rejects.toThrow(
      '无权访问',
    )
    model.findOne.mockResolvedValueOnce({ url: 'https://foreign.example/image.png' })
    await expect(service.resolve([{ assetId, role: 'style' }], userId)).rejects.toThrow(
      '上传到个人空间',
    )
    model.findOne.mockResolvedValueOnce({
      objectKey: 'other-user/image.png',
      mimeType: 'image/png',
    })
    await expect(service.resolve([{ assetId, role: 'person' }], userId)).rejects.toThrow(
      '上传到个人空间',
    )
    expect((await service.resolve([{ assetId, role: 'logo' }], userId))[0].strategy).toBe(
      'compose_logo',
    )
    await expect(
      service.resolve(
        [
          { assetId, role: 'logo' },
          { assetId, role: 'style' },
        ],
        userId,
      ),
    ).rejects.toThrow('不重复')
  })
})
