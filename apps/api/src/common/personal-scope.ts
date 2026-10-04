import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'

export function assertObjectId(id: string): void {
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id))
    throw new BadRequestException('ID 格式不正确')
}

export function personalCreatorFilter(userId: string) {
  assertObjectId(userId)
  return { creatorId: new Types.ObjectId(userId) }
}

// 个人资源始终属于创建者，与当前企业上下文无关。
export function assertPersonalOwner(userId: string, creatorId: string): void {
  if (creatorId !== userId) throw new NotFoundException('资源不存在或无权访问')
}
