import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'

import { WorksController } from './works.controller'
import { WorksService } from './works.service'

describe('Works 对象归属', () => {
  const a = new Types.ObjectId().toString()
  const b = new Types.ObjectId().toString()
  const workId = new Types.ObjectId()
  const workflowId = new Types.ObjectId().toString()
  const foreignKey = `works/${b}/${new Types.ObjectId()}/versions/1.png`
  const ownKey = `works/${a}/${workId}/versions/1.png`
  const work = {
    _id: workId,
    creatorId: new Types.ObjectId(a),
    spaceId: 'personal',
    objectKey: ownKey,
    toObject: () => ({}),
  }
  const workModel = { findOne: jest.fn(), findByIdAndDelete: jest.fn() }
  const versions = { find: jest.fn(), deleteMany: jest.fn(), findOne: jest.fn() }
  const workflows = { findOne: jest.fn() }
  const storage = { deleteObject: jest.fn(), getSignedUrl: jest.fn(), getObject: jest.fn() }
  const service = new WorksService(
    workModel as never,
    versions as never,
    {} as never,
    workflows as never,
    {} as never,
    storage as never,
    { getAccessibleSpace: jest.fn() } as never,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    workModel.findOne.mockResolvedValue(work)
  })

  it('旧入口仅委托可信工作流，不保存客户端对象和质检', async () => {
    const createTrustedVersion = jest.fn()
    const controller = new WorksController({ createTrustedVersion } as unknown as WorksService)
    await controller.createVersion({ user: { sub: a } }, workId.toString(), { workflowId })
    expect(createTrustedVersion).toHaveBeenCalledWith(a, workId.toString(), workflowId)
  })

  it('A 不能访问 B 的作品，也不能生成签名或删除对象', async () => {
    workModel.findOne.mockResolvedValue({ ...work, creatorId: new Types.ObjectId(b) })
    await expect(service.findOne(a, workId.toString())).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.remove(a, workId.toString())).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.export(a, workId.toString(), { format: 'png' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(storage.getSignedUrl).not.toHaveBeenCalled()
    expect(storage.deleteObject).not.toHaveBeenCalled()
  })

  it('历史版本引用 B 对象时拒绝签名', async () => {
    versions.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([{ objectKey: foreignKey, toObject: () => ({}) }]),
    })
    await expect(service.findOne(a, workId.toString())).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.getSignedUrl).not.toHaveBeenCalled()
  })

  it('历史版本引用 B 对象时拒绝整个删除操作', async () => {
    versions.find.mockResolvedValue([{ objectKey: foreignKey }])
    await expect(service.remove(a, workId.toString())).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.deleteObject).not.toHaveBeenCalled()
    expect(workModel.findByIdAndDelete).not.toHaveBeenCalled()
  })

  it('B 的合法对象仍可正常签名，A 的请求未改动它', async () => {
    const bWork = {
      ...work,
      creatorId: new Types.ObjectId(b),
      objectKey: `works/${b}/${workId}/versions/1.png`,
    }
    workModel.findOne.mockResolvedValue(bWork)
    versions.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })
    storage.getSignedUrl.mockResolvedValue('b-signed-url')
    await expect(service.findOne(a, workId.toString())).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.findOne(b, workId.toString())).resolves.toMatchObject({
      finalImageUrl: 'b-signed-url',
    })
    expect(storage.getSignedUrl).toHaveBeenCalledWith(bWork.objectKey)
    expect(storage.deleteObject).not.toHaveBeenCalled()
  })

  it('无可信对象的历史 URL 不会作为作品预览返回', async () => {
    workModel.findOne.mockResolvedValue({
      ...work,
      objectKey: undefined,
      finalImageUrl: 'foreign-url',
    })
    versions.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })
    await expect(service.findOne(a, workId.toString())).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.getSignedUrl).not.toHaveBeenCalled()
  })

  it('正常删除只删除本人作品对象', async () => {
    versions.find.mockResolvedValue([{ objectKey: ownKey }])
    await expect(service.remove(a, workId.toString())).resolves.toEqual({ success: true })
    expect(storage.deleteObject).toHaveBeenCalledTimes(1)
    expect(storage.deleteObject).toHaveBeenCalledWith(ownKey)
  })

  it('可信工作流中混入 B 的对象也不可引用', async () => {
    workflows.findOne.mockResolvedValue({
      status: 'completed',
      spaceId: 'personal',
      result: { compose: { objectKey: foreignKey }, finalEvaluation: { passed: true } },
    })
    await expect(
      service.createTrustedVersion(a, workId.toString(), workflowId),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.getObject).not.toHaveBeenCalled()
  })

  it('A 不能从 B 的工作流创建版本', async () => {
    workflows.findOne.mockResolvedValue(null)
    await expect(
      service.createTrustedVersion(a, workId.toString(), workflowId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(workflows.findOne).toHaveBeenCalledWith({ _id: workflowId, userId: a })
    expect(storage.getObject).not.toHaveBeenCalled()
  })

  it('无效作品 ID 返回 400', async () => {
    await expect(service.remove(a, 'invalid')).rejects.toBeInstanceOf(BadRequestException)
    expect(workModel.findOne).not.toHaveBeenCalled()
  })
})
