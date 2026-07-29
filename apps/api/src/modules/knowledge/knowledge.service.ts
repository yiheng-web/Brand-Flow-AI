import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ingestDocument } from '@brand-flow/agent'
import type { SpaceType } from '@brand-flow/contracts'
import { Model, Types } from 'mongoose'

import { Role } from '@/common/enums'
import { OrgService } from '@/modules/org/org.service'

import {
  CreateKnowledgeDto,
  CreateKnowledgeItemDto,
  UpdateKnowledgeDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto'
import { Knowledge, KnowledgeDocument } from './schemas/knowledge.schema'
import { KnowledgeItem, KnowledgeItemDocument } from './schemas/knowledge-item.schema'

interface KnowledgeScope {
  spaceId: string
  spaceType: SpaceType
  ownerId: Types.ObjectId
  enterpriseId?: string
  role: Role
}

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectModel(Knowledge.name) private readonly knowledgeModel: Model<KnowledgeDocument>,
    @InjectModel(KnowledgeItem.name)
    private readonly knowledgeItemModel: Model<KnowledgeItemDocument>,
    private readonly orgService: OrgService,
  ) {}

  async create(userId: string, dto: CreateKnowledgeDto) {
    const scope = await this.resolveScope(userId, dto.spaceId)
    this.assertCanCreate(scope)
    if (dto.isRequired && scope.spaceType !== 'enterprise') {
      throw new BadRequestException('只有企业空间可以设置强制知识库')
    }

    return this.knowledgeModel.create({
      name: dto.name,
      description: dto.description,
      pineconeNamespace: dto.pineconeNamespace,
      isRequired: dto.isRequired ?? false,
      spaceId: scope.spaceId,
      spaceType: scope.spaceType,
      enterpriseId: scope.enterpriseId ? new Types.ObjectId(scope.enterpriseId) : undefined,
      creatorId: new Types.ObjectId(userId),
    })
  }

  async findAll(userId: string, spaceId: string) {
    const scope = await this.resolveScope(userId, spaceId)
    return this.knowledgeModel
      .find(this.buildListFilter(scope))
      .populate('creatorId', 'email profile')
      .sort({ isRequired: -1, createdAt: -1 })
  }

  async findOne(userId: string, id: string) {
    const knowledge = await this.findKnowledgeById(id)
    await this.assertKnowledgeAccess(userId, knowledge)
    return knowledge.populate('creatorId', 'email profile')
  }

  async update(userId: string, id: string, dto: UpdateKnowledgeDto) {
    const knowledge = await this.findKnowledgeById(id)
    const scope = await this.assertCanManage(userId, knowledge)
    if (dto.isRequired !== undefined && scope.spaceType !== 'enterprise') {
      throw new BadRequestException('只有企业空间可以设置强制知识库')
    }
    return this.knowledgeModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true })
  }

  async ingestText(userId: string, knowledgeId: string, content: string) {
    const knowledge = await this.findKnowledgeById(knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    const result = await ingestDocument(content, {
      enterpriseId: scope.enterpriseId ?? `personal:${userId}`,
      knowledgeId,
    })
    return {
      message: result.vectorized
        ? `成功入库，共生成 ${result.chunks} 个向量切片`
        : '知识项已保存；当前未启用向量化，V1 工作流将直接读取品牌约束',
      ...result,
    }
  }

  async createItem(userId: string, knowledgeId: string, dto: CreateKnowledgeItemDto) {
    const knowledge = await this.findKnowledgeById(knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    const item = await this.createScopedItem(userId, knowledge, scope, {
      ...dto,
      sourceType: 'manual',
    })
    const ingest = await this.ingestText(userId, knowledgeId, dto.content)
    return { item, ingest }
  }

  async createItemFromAsset(
    userId: string,
    knowledgeId: string,
    payload: {
      title: string
      content: string
      assetId: string
      tags?: string[]
      metadata?: Record<string, unknown>
    },
  ) {
    const knowledge = await this.findKnowledgeById(knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    const constraintLevel =
      payload.metadata?.constraintLevel === 'required' ||
      payload.metadata?.constraintLevel === 'optional'
        ? payload.metadata.constraintLevel
        : 'recommended'
    const item = await this.createScopedItem(userId, knowledge, scope, {
      ...payload,
      sourceType: 'asset',
      constraintLevel,
    })
    const ingest = await this.ingestText(userId, knowledgeId, payload.content)
    return { item, ingest }
  }

  async findItems(userId: string, knowledgeId: string) {
    const knowledge = await this.findKnowledgeById(knowledgeId)
    await this.assertKnowledgeAccess(userId, knowledge)
    return this.knowledgeItemModel
      .find({ knowledgeId: new Types.ObjectId(knowledgeId) })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findItem(userId: string, knowledgeId: string, itemId: string) {
    await this.findOne(userId, knowledgeId)
    const item = await this.knowledgeItemModel
      .findOne({ _id: itemId, knowledgeId: new Types.ObjectId(knowledgeId) })
      .populate('creatorId', 'email profile')
    if (!item) throw new NotFoundException('知识项不存在或无权访问')
    return item
  }

  async updateItem(
    userId: string,
    knowledgeId: string,
    itemId: string,
    dto: UpdateKnowledgeItemDto,
  ) {
    const knowledge = await this.findKnowledgeById(knowledgeId)
    await this.assertCanManage(userId, knowledge)
    await this.findItem(userId, knowledgeId, itemId)
    const item = await this.knowledgeItemModel.findByIdAndUpdate(itemId, dto, {
      new: true,
      runValidators: true,
    })
    if (dto.content) await this.ingestText(userId, knowledgeId, dto.content)
    return item
  }

  async removeItem(userId: string, knowledgeId: string, itemId: string) {
    const knowledge = await this.findKnowledgeById(knowledgeId)
    await this.assertCanManage(userId, knowledge)
    const item = await this.findItem(userId, knowledgeId, itemId)
    await this.knowledgeItemModel.findByIdAndDelete(item._id)
    return { success: true }
  }

  async remove(userId: string, id: string) {
    const knowledge = await this.findKnowledgeById(id)
    await this.assertCanManage(userId, knowledge)
    await this.knowledgeItemModel.deleteMany({ knowledgeId: knowledge._id })
    await this.knowledgeModel.findByIdAndDelete(knowledge._id)
    return { success: true }
  }

  async getRecords(userId: string, knowledgeId: string): Promise<unknown[]> {
    await this.findOne(userId, knowledgeId)
    const { listKnowledgeRecords } = await import('@brand-flow/agent')
    return listKnowledgeRecords(knowledgeId)
  }

  private async createScopedItem(
    userId: string,
    knowledge: KnowledgeDocument,
    scope: KnowledgeScope,
    payload: CreateKnowledgeItemDto & {
      sourceType: 'manual' | 'asset'
      assetId?: string
    },
  ) {
    return this.knowledgeItemModel.create({
      knowledgeId: knowledge._id,
      spaceId: scope.spaceId,
      spaceType: scope.spaceType,
      enterpriseId: scope.enterpriseId ? new Types.ObjectId(scope.enterpriseId) : undefined,
      title: payload.title,
      content: payload.content,
      tags: payload.tags ?? [],
      sourceType: payload.sourceType,
      assetId: payload.assetId ? new Types.ObjectId(payload.assetId) : undefined,
      status: 'active',
      constraintLevel: payload.constraintLevel ?? 'recommended',
      creatorId: new Types.ObjectId(userId),
      metadata: payload.metadata ?? {},
    })
  }

  private async findKnowledgeById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('知识库不存在或无权访问')
    const knowledge = await this.knowledgeModel.findById(id)
    if (!knowledge) throw new NotFoundException('知识库不存在或无权访问')
    return knowledge
  }

  private async assertKnowledgeAccess(userId: string, knowledge: KnowledgeDocument) {
    const spaceId = knowledge.spaceId || knowledge.enterpriseId?.toString()
    if (!spaceId) throw new NotFoundException('知识库缺少有效空间归属')
    if (
      (knowledge.spaceType === 'personal' || spaceId === 'personal') &&
      knowledge.creatorId.toString() !== userId
    ) {
      throw new NotFoundException('知识库不存在或无权访问')
    }
    return this.resolveScope(userId, spaceId)
  }

  private async assertCanManage(userId: string, knowledge: KnowledgeDocument) {
    const scope = await this.assertKnowledgeAccess(userId, knowledge)
    if (knowledge.creatorId.toString() === userId) return scope
    if (scope.role !== Role.OWNER && scope.role !== Role.ADMIN) {
      throw new ForbiddenException('您无权管理此知识库')
    }
    return scope
  }

  private assertCanCreate(scope: KnowledgeScope) {
    if (scope.spaceType !== 'personal' && scope.role !== Role.OWNER && scope.role !== Role.ADMIN) {
      throw new ForbiddenException('只有空间管理员可以创建团队或企业知识库')
    }
  }

  private async resolveScope(userId: string, spaceId: string): Promise<KnowledgeScope> {
    const space = await this.orgService.getAccessibleSpace(userId, spaceId)
    return {
      spaceId,
      spaceType: space.spaceType,
      ownerId: new Types.ObjectId(userId),
      enterpriseId: space.enterpriseId,
      role: space.role,
    }
  }

  private buildListFilter(scope: KnowledgeScope) {
    const exactScope =
      scope.spaceType === 'personal'
        ? { spaceId: scope.spaceId, creatorId: scope.ownerId }
        : { spaceId: scope.spaceId }
    if (scope.spaceType === 'personal' || !scope.enterpriseId) return exactScope
    const legacyEnterprise = {
      spaceId: { $exists: false },
      enterpriseId: new Types.ObjectId(scope.enterpriseId),
    }
    if (scope.spaceType === 'enterprise') return { $or: [exactScope, legacyEnterprise] }
    return {
      $or: [
        exactScope,
        {
          spaceId: scope.enterpriseId,
          spaceType: 'enterprise',
          enterpriseId: new Types.ObjectId(scope.enterpriseId),
          isRequired: true,
        },
      ],
    }
  }
}
