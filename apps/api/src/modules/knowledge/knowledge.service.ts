import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Knowledge, KnowledgeDocument } from './schemas/knowledge.schema'
import { KnowledgeItem, KnowledgeItemDocument } from './schemas/knowledge-item.schema'
import {
  CreateKnowledgeDto,
  CreateKnowledgeItemDto,
  UpdateKnowledgeDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto'
import { OwnerType, Role, Visibility } from '@/common/enums'
import { AccessibleSpaceContext, OrgService } from '@/modules/org/org.service'
import { Membership, MembershipDocument } from '@/modules/org/schemas/membership.schema'
import { ingestDocument } from '@brand-flow/agent'

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectModel(Knowledge.name) private knowledgeModel: Model<KnowledgeDocument>,
    @InjectModel(KnowledgeItem.name)
    private knowledgeItemModel: Model<KnowledgeItemDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    private readonly orgService: OrgService,
  ) {}

  async create(userId: string, workspaceId: string, dto: CreateKnowledgeDto) {
    const space = await this.orgService.resolveAccessibleSpace(userId, dto.spaceId, workspaceId)

    const { spaceId: _spaceId, ...knowledgePayload } = dto
    const knowledge = await this.knowledgeModel.create({
      ...knowledgePayload,
      creatorId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(space.workspaceId),
      spaceId: new Types.ObjectId(space.spaceId),
      ownerId: new Types.ObjectId(space.ownerId),
      ownerType: space.ownerType,
      visibility: space.visibility,
      status: 'active',
    })

    return knowledge
  }

  async findAll(userId: string, workspaceId: string) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const teamMemberships = await this.membershipModel.find({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      scopeType: 'team',
      status: 'active',
    })
    const teamIds = teamMemberships.map((membership) => membership.scopeId.toString())

    return this.knowledgeModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        status: { $ne: 'archived' },
        $or: [
          {
            ownerType: OwnerType.USER,
            ownerId: new Types.ObjectId(userId),
          },
          {
            ownerType: OwnerType.TEAM,
            ownerId: { $in: teamIds.map((id) => new Types.ObjectId(id)) },
          },
          { ownerType: OwnerType.WORKSPACE },
        ],
      })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findSelectable(userId: string, workspaceId: string, spaceId?: string) {
    if (!spaceId) {
      throw new BadRequestException('空间 ID 不能为空')
    }

    const space = await this.orgService.resolveAccessibleSpace(userId, spaceId, workspaceId)

    return this.knowledgeModel
      .find({
        workspaceId: new Types.ObjectId(space.workspaceId),
        spaceId: new Types.ObjectId(space.spaceId),
        status: { $ne: 'archived' },
      })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findOne(userId: string, workspaceId: string, id: string) {
    const knowledge = await this.checkReadable(userId, workspaceId, id)
    return knowledge.populate('creatorId', 'email profile')
  }

  async update(userId: string, workspaceId: string, id: string, dto: UpdateKnowledgeDto) {
    await this.checkPermission(userId, workspaceId, id)

    const knowledge = await this.knowledgeModel.findByIdAndUpdate(id, dto, { new: true })
    return knowledge
  }

  async ingestText(userId: string, workspaceId: string, knowledgeId: string, content: string) {
    // 1. 权限校验
    await this.checkPermission(userId, workspaceId, knowledgeId)

    // 2. 调用 agent 层的能力进行切片和向量化入库
    const result = await ingestDocument(content, {
      enterpriseId: workspaceId,
      knowledgeId,
    })

    return {
      message: `成功入库，共生成 ${result.chunks} 个向量切片`,
      ...result,
    }
  }

  async createItem(
    userId: string,
    workspaceId: string,
    knowledgeId: string,
    dto: CreateKnowledgeItemDto,
  ) {
    await this.checkPermission(userId, workspaceId, knowledgeId)

    const item = await this.knowledgeItemModel.create({
      knowledgeId: new Types.ObjectId(knowledgeId),
      workspaceId: new Types.ObjectId(workspaceId),
      title: dto.title,
      content: dto.content,
      tags: dto.tags || [],
      sourceType: 'manual',
      status: 'active',
      creatorId: new Types.ObjectId(userId),
      metadata: dto.metadata || {},
    })

    const ingest = await this.ingestText(userId, workspaceId, knowledgeId, dto.content)

    return {
      item,
      ingest,
    }
  }

  async createItemFromAsset(
    userId: string,
    workspaceId: string,
    knowledgeId: string,
    payload: {
      title: string
      content: string
      assetId: string
      tags?: string[]
      metadata?: Record<string, any>
    },
  ) {
    await this.checkPermission(userId, workspaceId, knowledgeId)

    const item = await this.knowledgeItemModel.create({
      knowledgeId: new Types.ObjectId(knowledgeId),
      workspaceId: new Types.ObjectId(workspaceId),
      title: payload.title,
      content: payload.content,
      tags: payload.tags || [],
      sourceType: 'asset',
      assetId: new Types.ObjectId(payload.assetId),
      status: 'active',
      creatorId: new Types.ObjectId(userId),
      metadata: payload.metadata || {},
    })

    const ingest = await this.ingestText(userId, workspaceId, knowledgeId, payload.content)

    return {
      item,
      ingest,
    }
  }

  async findItems(userId: string, workspaceId: string, knowledgeId: string) {
    await this.checkReadable(userId, workspaceId, knowledgeId)

    return this.knowledgeItemModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        knowledgeId: new Types.ObjectId(knowledgeId),
      })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findItem(userId: string, workspaceId: string, knowledgeId: string, itemId: string) {
    await this.checkReadable(userId, workspaceId, knowledgeId)

    const item = await this.knowledgeItemModel
      .findOne({
        _id: itemId,
        workspaceId: new Types.ObjectId(workspaceId),
        knowledgeId: new Types.ObjectId(knowledgeId),
      })
      .populate('creatorId', 'email profile')

    if (!item) {
      throw new NotFoundException('知识项不存在或无权访问')
    }

    return item
  }

  async updateItem(
    userId: string,
    workspaceId: string,
    knowledgeId: string,
    itemId: string,
    dto: UpdateKnowledgeItemDto,
  ) {
    await this.checkPermission(userId, workspaceId, knowledgeId)
    await this.findItem(userId, workspaceId, knowledgeId, itemId)

    const item = await this.knowledgeItemModel.findByIdAndUpdate(
      itemId,
      {
        ...dto,
        metadata: dto.metadata,
      },
      { new: true },
    )

    if (dto.content) {
      await this.ingestText(userId, workspaceId, knowledgeId, dto.content)
    }

    return item
  }

  async removeItem(userId: string, workspaceId: string, knowledgeId: string, itemId: string) {
    await this.checkPermission(userId, workspaceId, knowledgeId)
    const item = await this.findItem(userId, workspaceId, knowledgeId, itemId)

    await this.knowledgeItemModel.findByIdAndDelete(item._id)

    return { success: true }
  }

  async remove(userId: string, workspaceId: string, id: string) {
    const knowledge = await this.checkPermission(userId, workspaceId, id)

    // TODO: 未来可以在此处同步删除 Pinecone 中的 namespace 以防孤儿数据
    // 目前仅删除 MongoDB 中的引用记录
    await this.knowledgeItemModel.deleteMany({ knowledgeId: knowledge._id })
    await this.knowledgeModel.findByIdAndDelete(knowledge._id)

    return { success: true }
  }

  async getRecords(userId: string, workspaceId: string, knowledgeId: string): Promise<any[]> {
    // 首先校验归属权限
    await this.checkReadable(userId, workspaceId, knowledgeId)

    // 调用底层库暴露的方法
    const { listKnowledgeRecords } = await import('@brand-flow/agent')
    const records = await listKnowledgeRecords(knowledgeId)
    return records
  }

  async assertSelectableKnowledgeIds(
    userId: string,
    workspaceId: string,
    spaceId: string,
    knowledgeIds: string[] = [],
  ) {
    const normalizedIds = [...new Set(knowledgeIds.filter(Boolean))]
    if (normalizedIds.length > 3) {
      throw new BadRequestException('本次创作最多选择 3 个知识库')
    }
    if (normalizedIds.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('知识库 ID 格式不正确')
    }

    const space = await this.orgService.resolveAccessibleSpace(userId, spaceId, workspaceId)
    if (!normalizedIds.length) {
      return { space, knowledgeIds: [] }
    }

    const knowledgeList = await this.knowledgeModel.find({
      _id: { $in: normalizedIds.map((id) => new Types.ObjectId(id)) },
      workspaceId: new Types.ObjectId(space.workspaceId),
      status: { $ne: 'archived' },
    })

    if (knowledgeList.length !== normalizedIds.length) {
      throw new BadRequestException('存在不可用或不存在的知识库')
    }

    const invalid = knowledgeList.find(
      (knowledge) => !this.isKnowledgeSelectableForSpace(knowledge, space),
    )
    if (invalid) {
      throw new BadRequestException('存在不属于当前创作空间的知识库')
    }

    return { space, knowledgeIds: normalizedIds }
  }

  private async checkPermission(userId: string, workspaceId: string, knowledgeId: string) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const knowledge = await this.knowledgeModel.findOne({
      _id: knowledgeId,
      workspaceId: new Types.ObjectId(workspaceId),
    })

    if (!knowledge) {
      throw new NotFoundException('知识库不存在或无权访问')
    }

    // 判断权限: 如果不是本人创建的，需要具有归属空间的 OWNER/ADMIN 权限
    if (knowledge.creatorId.toString() !== userId) {
      if (knowledge.ownerType === OwnerType.USER) {
        throw new BadRequestException('您无权操作此知识库')
      }

      const membership = await this.membershipModel.findOne({
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId),
        status: 'active',
        ...(knowledge.ownerType === OwnerType.TEAM
          ? { scopeType: 'team', scopeId: knowledge.ownerId }
          : { scopeType: 'workspace', scopeId: new Types.ObjectId(workspaceId) }),
      })

      if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
        throw new BadRequestException('您无权操作此知识库')
      }
    }

    return knowledge
  }

  private async checkReadable(userId: string, workspaceId: string, knowledgeId: string) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const knowledge = await this.checkReadableByWorkspace(workspaceId, knowledgeId)

    if (knowledge.ownerType === OwnerType.USER) {
      if (knowledge.ownerId.toString() !== userId) {
        throw new NotFoundException('知识库不存在或无权访问')
      }
      return knowledge
    }

    const membership = await this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      status: 'active',
      ...(knowledge.ownerType === OwnerType.TEAM
        ? { scopeType: 'team', scopeId: knowledge.ownerId }
        : { scopeType: 'workspace', scopeId: new Types.ObjectId(workspaceId) }),
    })

    if (!membership) {
      throw new NotFoundException('知识库不存在或无权访问')
    }

    return knowledge
  }

  private async checkReadableByWorkspace(workspaceId: string, knowledgeId: string) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const knowledge = await this.knowledgeModel.findOne({
      _id: knowledgeId,
      workspaceId: new Types.ObjectId(workspaceId),
    })

    if (!knowledge) {
      throw new NotFoundException('知识库不存在或无权访问')
    }

    return knowledge
  }

  private isKnowledgeSelectableForSpace(
    knowledge: KnowledgeDocument,
    space: AccessibleSpaceContext,
  ) {
    return (
      knowledge.spaceId.toString() === space.spaceId &&
      knowledge.ownerType === space.ownerType &&
      knowledge.ownerId.toString() === space.ownerId
    )
  }
}
