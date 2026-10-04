import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { InjectModel } from '@nestjs/mongoose'
import { ingestDocument, removeKnowledgeVectors } from '@brand-flow/agent'
import { parseKnowledgeImport } from '@brand-flow/contracts'
import type { SpaceType, KnowledgeImportItem } from '@brand-flow/contracts'
import { migrateKnowledgeIndexes } from './knowledge-indexes'
import { Model, Types } from 'mongoose'

import { Role } from '@/common/enums'
import { assertObjectId, assertPersonalOwner, personalCreatorFilter } from '@/common/personal-scope'
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
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeService.name)
  constructor(
    @InjectModel(Knowledge.name) private readonly knowledgeModel: Model<KnowledgeDocument>,
    @InjectModel(KnowledgeItem.name)
    private readonly knowledgeItemModel: Model<KnowledgeItemDocument>,
    private readonly orgService: OrgService,
  ) {}

  async onModuleInit(): Promise<void> {
    await migrateKnowledgeIndexes(this.knowledgeModel)
    await this.knowledgeItemModel.createIndexes()
  }

  async create(userId: string, dto: CreateKnowledgeDto) {
    const scope = await this.resolveScope(userId, dto.spaceId)
    this.assertCanCreate(scope)
    if (dto.isRequired && scope.spaceType !== 'enterprise') {
      throw new BadRequestException('只有企业空间可以设置强制知识库')
    }

    return this.withDuplicateError(() =>
      this.knowledgeModel.create({
        name: this.normalizeName(dto.name),
        description: dto.description,
        pineconeNamespace: dto.pineconeNamespace,
        isRequired: dto.isRequired ?? false,
        spaceId: scope.spaceId,
        spaceType: scope.spaceType,
        enterpriseId: scope.enterpriseId ? new Types.ObjectId(scope.enterpriseId) : undefined,
        creatorId: new Types.ObjectId(userId),
      }),
    )
  }

  async findAll(userId: string, spaceId: string) {
    const scope = await this.resolveScope(userId, spaceId)
    return this.knowledgeModel
      .find(this.buildListFilter(scope))
      .populate('creatorId', 'email profile')
      .sort({ isRequired: -1, createdAt: -1 })
  }

  async findOne(userId: string, id: string) {
    const knowledge = await this.findKnowledgeById(userId, id)
    await this.assertKnowledgeAccess(userId, knowledge)
    return knowledge.populate('creatorId', 'email profile')
  }

  async update(userId: string, id: string, dto: UpdateKnowledgeDto) {
    const knowledge = await this.findKnowledgeById(userId, id)
    const scope = await this.assertCanManage(userId, knowledge)
    if (dto.isRequired !== undefined && scope.spaceType !== 'enterprise') {
      throw new BadRequestException('只有企业空间可以设置强制知识库')
    }
    return this.withDuplicateError(() =>
      this.knowledgeModel
        .findByIdAndUpdate(
          id,
          { ...dto, ...(dto.name !== undefined ? { name: this.normalizeName(dto.name) } : {}) },
          { new: true, runValidators: true },
        )
        .exec(),
    )
  }

  async ingestText(userId: string, knowledgeId: string, content: string) {
    const items = await this.previewImport(userId, knowledgeId, content)
    const batchId = createHash('sha256').update(content.trim()).digest('hex')
    return this.importItems(userId, knowledgeId, batchId, items)
  }

  async previewImport(
    userId: string,
    knowledgeId: string,
    content: string,
  ): Promise<KnowledgeImportItem[]> {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    await this.assertCanManage(userId, knowledge)
    try {
      return parseKnowledgeImport(content)
    } catch (error: unknown) {
      throw new BadRequestException(error instanceof Error ? error.message : '导入文本无效')
    }
  }

  async importItems(
    userId: string,
    knowledgeId: string,
    batchId: string,
    items: KnowledgeImportItem[],
  ) {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    if (items.length < 1 || items.length > 200)
      throw new BadRequestException('一次导入 1~200 条规则')
    if (
      items.some((item) => !item.title.trim() || !item.content.trim()) ||
      items.reduce((chars, item) => chars + item.content.length, 0) > 100_000
    ) {
      throw new BadRequestException('规则标题和正文不能为空，总正文最多 100000 字符')
    }
    const results = []
    for (const [index, payload] of items.entries()) {
      const importKey = createHash('sha256')
        .update(JSON.stringify([batchId, index]))
        .digest('hex')
      const filter = { knowledgeId: knowledge._id, importKey }
      const document = this.scopedItemData(userId, knowledge, scope, {
        ...payload,
        sourceType: 'import',
        metadata: { importBatchId: batchId },
      })
      let item: KnowledgeItemDocument | null
      try {
        item = await this.knowledgeItemModel.findOneAndUpdate(
          filter,
          { $setOnInsert: { ...document, importKey } },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
        )
      } catch (error: unknown) {
        if (!this.isDuplicateError(error)) throw error
        item = await this.knowledgeItemModel.findOne(filter)
      }
      if (!item) throw new Error('导入条目未持久化，重试时保持原 batchId')
      if (
        item.title !== payload.title ||
        item.content !== payload.content ||
        item.constraintLevel !== payload.constraintLevel
      ) {
        throw new ConflictException('该批次已导入不同内容，请重新解析后再确认；原条目已保留')
      }
      results.push(await this.syncItemVector(item, scope))
    }
    const vectorized = results.every((result) => result.vectorized)
    const failed = results.some((result) => result.failed)
    return {
      success: true,
      imported: items.length,
      chunks: results.reduce((count, result) => count + result.chunks, 0),
      vectorized,
      failed,
      message: failed
        ? '已导入到知识库，部分语义向量同步失败，可重试同步'
        : vectorized
          ? '已导入到知识库并同步语义向量'
          : '已导入到知识库，语义向量未启用',
    }
  }

  async createItem(userId: string, knowledgeId: string, dto: CreateKnowledgeItemDto) {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    const item = await this.createScopedItem(userId, knowledge, scope, {
      ...dto,
      sourceType: 'manual',
    })
    const ingest = await this.syncItemVector(item, scope)
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
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
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
    const ingest = await this.syncItemVector(item, scope)
    return { item, ingest }
  }

  async findItems(userId: string, knowledgeId: string) {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    await this.assertKnowledgeAccess(userId, knowledge)
    return this.knowledgeItemModel
      .find({ knowledgeId: new Types.ObjectId(knowledgeId) })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findItem(userId: string, knowledgeId: string, itemId: string) {
    assertObjectId(itemId)
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
    if (
      (dto.title !== undefined && !dto.title.trim()) ||
      (dto.content !== undefined && !dto.content.trim())
    ) {
      throw new BadRequestException('知识项标题和正文不能为空')
    }
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    await this.findItem(userId, knowledgeId, itemId)
    const item = await this.knowledgeItemModel.findByIdAndUpdate(itemId, dto, {
      new: true,
      runValidators: true,
    })
    if (item) await this.syncItemVector(item, scope)
    return item
  }

  async removeItem(userId: string, knowledgeId: string, itemId: string) {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    await this.assertCanManage(userId, knowledge)
    const item = await this.findItem(userId, knowledgeId, itemId)
    await removeKnowledgeVectors(knowledgeId, itemId)
    await this.knowledgeItemModel.findByIdAndDelete(item._id)
    return { success: true }
  }

  async remove(userId: string, id: string) {
    const knowledge = await this.findKnowledgeById(userId, id)
    await this.assertCanManage(userId, knowledge)
    await removeKnowledgeVectors(id)
    await this.knowledgeItemModel.deleteMany({ knowledgeId: knowledge._id })
    await this.knowledgeModel.findByIdAndDelete(knowledge._id)
    return { success: true }
  }

  async getRecords(userId: string, knowledgeId: string): Promise<unknown[]> {
    await this.findOne(userId, knowledgeId)
    const { listKnowledgeRecords } = await import('@brand-flow/agent')
    return listKnowledgeRecords(knowledgeId)
  }

  private scopedItemData(
    userId: string,
    knowledge: KnowledgeDocument,
    scope: KnowledgeScope,
    payload: CreateKnowledgeItemDto & {
      sourceType: 'manual' | 'asset' | 'import'
      assetId?: string
    },
  ) {
    return {
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
    }
  }

  private async createScopedItem(
    userId: string,
    knowledge: KnowledgeDocument,
    scope: KnowledgeScope,
    payload: CreateKnowledgeItemDto & { sourceType: 'manual' | 'asset'; assetId?: string },
  ) {
    if (!payload.title.trim() || !payload.content.trim())
      throw new BadRequestException('知识项标题和正文不能为空')
    return this.knowledgeItemModel.create(this.scopedItemData(userId, knowledge, scope, payload))
  }

  async retryVectorSync(userId: string, knowledgeId: string, itemId: string) {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    const item = await this.findItem(userId, knowledgeId, itemId)
    return this.syncItemVector(item, scope)
  }

  private async syncItemVector(item: KnowledgeItemDocument, scope: KnowledgeScope) {
    let result
    try {
      await removeKnowledgeVectors(item.knowledgeId.toString(), item._id.toString())
      const vector =
        item.status === 'archived'
          ? { success: true as const, chunks: 0, vectorized: false, skipped: true }
          : await ingestDocument(item.content, {
              enterpriseId: scope.enterpriseId ?? `personal:${scope.ownerId.toString()}`,
              knowledgeId: item.knowledgeId.toString(),
              itemId: item._id.toString(),
            })
      result = {
        ...vector,
        failed: false,
        message: vector.vectorized
          ? '已保存知识项并同步语义向量'
          : '已保存知识项，语义向量未启用或已归档',
      }
    } catch {
      this.logger.warn(`知识项 ${item._id.toString()} 的向量同步失败，Mongo 数据保留以便重试`)
      result = {
        success: true as const,
        chunks: 0,
        vectorized: false,
        failed: true,
        message: '已保存知识项，语义向量同步失败，可重试',
      }
    }
    await this.knowledgeItemModel.updateOne(
      { _id: item._id, content: item.content, status: item.status },
      { $set: { 'metadata.vectorSync': result } },
    )
    return result
  }

  private normalizeName(name: string): string {
    if (!name.trim()) throw new BadRequestException('知识库名称不能为空')
    return name.trim()
  }

  private isDuplicateError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  }

  private async withDuplicateError<T>(operation: () => PromiseLike<T>): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      if (this.isDuplicateError(error)) throw new ConflictException('当前空间中已存在同名知识库')
      throw error
    }
  }

  private async findKnowledgeById(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('知识库不存在或无权访问')
    const knowledge = await this.knowledgeModel.findOne({
      _id: id,
      $or: [
        { spaceId: 'personal', ...personalCreatorFilter(userId) },
        { spaceId: { $ne: 'personal' }, spaceType: { $ne: 'personal' } },
      ],
    })
    if (!knowledge) throw new NotFoundException('知识库不存在或无权访问')
    return knowledge
  }

  private async assertKnowledgeAccess(userId: string, knowledge: KnowledgeDocument) {
    const spaceId = knowledge.spaceId || knowledge.enterpriseId?.toString()
    if (!spaceId) throw new NotFoundException('知识库缺少有效空间归属')
    if (knowledge.spaceType === 'personal' || spaceId === 'personal') {
      assertPersonalOwner(userId, knowledge.creatorId.toString())
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
        ? { spaceId: scope.spaceId, ...personalCreatorFilter(scope.ownerId.toString()) }
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
