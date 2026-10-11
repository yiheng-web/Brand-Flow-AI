import { AuthorizationService } from '../org/authorization.service'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'
import sharp from 'sharp'

import { OwnerType, Visibility } from '@/common/enums'
import { AssetsService } from './assets.service'
import { MAX_ASSET_IMAGE_BYTES } from './assets.constants'

describe('Assets 上传与个人归属', () => {
  const userId = new Types.ObjectId().toString()
  const assetId = new Types.ObjectId()
  const dto = {
    name: '测试',
    type: 'reference',
    ownerId: userId,
    ownerType: OwnerType.USER,
    visibility: Visibility.PRIVATE,
  }
  const asset = {
    _id: assetId,
    name: '测试',
    type: 'reference',
    url: 'test',
    creatorId: new Types.ObjectId(userId),
    ownerId: new Types.ObjectId(userId),
    ownerType: OwnerType.USER,
    visibility: Visibility.PRIVATE,
    metadata: {},
    save: jest.fn(),
  }
  const model = {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
  }
  const storage = {
    uploadObject: jest.fn(),
    getObjectUrl: jest.fn(),
    getSignedUrl: jest.fn(),
    deleteObject: jest.fn(),
  }
  const knowledge = { createItemFromAsset: jest.fn() }
  const service = new AssetsService(
    model as never,
    new AuthorizationService({} as never, {} as never, {} as never),
    storage as never,
    knowledge as never,
    {} as never,
  )
  const file = (buffer: Buffer, mimetype = 'image/png') => ({
    originalname: 'image.png',
    mimetype,
    size: buffer.length,
    buffer,
  })

  beforeEach(() => jest.clearAllMocks())

  it('伪造 PNG 文本在上传前返回 400', async () => {
    await expect(
      service.uploadAsset(userId, undefined, dto, file(Buffer.from('text'))),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.uploadObject).not.toHaveBeenCalled()
  })

  it('超过 10 MiB 返回 400', async () => {
    await expect(
      service.uploadAsset(userId, undefined, dto, file(Buffer.alloc(MAX_ASSET_IMAGE_BYTES + 1))),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.uploadObject).not.toHaveBeenCalled()
  })

  it('真实格式与 MIME 不符或 SVG 均被拒绝', async () => {
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer()
    await expect(service.uploadAsset(userId, undefined, dto, file(jpeg))).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(
      service.uploadAsset(userId, undefined, dto, file(Buffer.from('<svg/>'), 'image/svg+xml')),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('真实 PNG 可正常上传，个人素材不写当前企业归属', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .png()
      .toBuffer()
    storage.uploadObject.mockImplementation(async ({ key }) => ({ key, bucket: 'test' }))
    model.create.mockImplementation(async (value) => ({ ...value, toObject: () => value }))
    await service.uploadAsset(userId, new Types.ObjectId().toString(), dto, {
      ...file(png),
      originalname: 'renamed..txt',
    })
    expect(storage.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringMatching(/\/original\.png$/) }),
    )
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseId: undefined, creatorId: new Types.ObjectId(userId) }),
    )
  })

  it('切换企业后仍可把本人个人素材保存到知识库', async () => {
    model.findOne.mockResolvedValue(asset)
    knowledge.createItemFromAsset.mockResolvedValue({
      item: { _id: new Types.ObjectId() },
      ingest: {},
    })
    const enterpriseId = new Types.ObjectId().toString()
    await service.saveToKnowledge(userId, enterpriseId, assetId.toString(), {
      knowledgeId: new Types.ObjectId().toString(),
    })
    expect(model.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({
            ownerType: OwnerType.USER,
            creatorId: new Types.ObjectId(userId),
          }),
        ]),
      }),
    )
    expect(knowledge.createItemFromAsset).toHaveBeenCalled()
  })

  it('A 不能删除 B 的个人素材或对象', async () => {
    model.findOne.mockResolvedValue({
      ...asset,
      creatorId: new Types.ObjectId(),
      objectKey: 'foreign',
    })
    await expect(service.deleteAsset(userId, assetId.toString())).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(storage.deleteObject).not.toHaveBeenCalled()
  })

  it('A 不能把 B 的个人素材引用进知识库', async () => {
    model.findOne.mockResolvedValue(null)
    await expect(
      service.saveToKnowledge(userId, new Types.ObjectId().toString(), assetId.toString(), {
        knowledgeId: new Types.ObjectId().toString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(knowledge.createItemFromAsset).not.toHaveBeenCalled()
  })

  it('A 不能以 B 的 ownerId 创建个人素材', async () => {
    await expect(
      service.createAsset(userId, undefined, {
        ...dto,
        ownerId: new Types.ObjectId().toString(),
        url: 'test-url',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(model.create).not.toHaveBeenCalled()
  })

  it('素材数据库写入失败会清理本次上传对象并保留原始错误', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .png()
      .toBuffer()
    storage.uploadObject.mockResolvedValue({ key: 'current-upload', bucket: 'test' })
    model.create.mockRejectedValue(new Error('db-write-failed'))
    await expect(service.uploadAsset(userId, undefined, dto, file(png))).rejects.toThrow(
      'db-write-failed',
    )
    expect(storage.deleteObject).toHaveBeenCalledWith('current-upload')
  })
})
