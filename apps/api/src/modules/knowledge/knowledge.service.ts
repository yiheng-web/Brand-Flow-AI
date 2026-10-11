import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { InjectModel } from '@nestjs/mongoose'
import { ingestDocument, removeKnowledgeVectors } from '@brand-flow/agent'
import { parseKnowledgeImport, mergeKnowledgeRules } from '@brand-flow/contracts'
import type { SpaceType, KnowledgeImportItem, ScopedKnowledgeRule } from '@brand-flow/contracts'
import { migrateKnowledgeIndexes } from './knowledge-indexes'
import { Model, Types } from 'mongoose'
import type { ClientSession } from 'mongoose'

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
    await this.orgService.authorization.assertCanManageKnowledge(userId, scope.spaceId)
    if (dto.isRequired && scope.spaceType === 'personal') {
      throw new BadRequestException('个人空间不能设置组织强制知识库')
    }

    return this.ruleTransaction(
      userId,
      scope,
      'knowledge.created',
      scope.spaceId,
      async (session) => {
        const document = {
          name: this.normalizeName(dto.name),
          description: dto.description,
          pineconeNamespace: dto.pineconeNamespace,
          isRequired: dto.isRequired ?? false,
          spaceId: scope.spaceId,
          spaceType: scope.spaceType,
          enterpriseId: scope.enterpriseId ? new Types.ObjectId(scope.enterpriseId) : undefined,
          creatorId: new Types.ObjectId(userId),
        }
        return this.withDuplicateError(async () => {
          if (!session) return this.knowledgeModel.create(document)
          const [knowledge] = await this.knowledgeModel.create([document], { session })
          return knowledge
        })
      },
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
    if (dto.isRequired !== undefined && scope.spaceType === 'personal') {
      throw new BadRequestException('个人空间不能设置组织强制知识库')
    }
    return this.ruleTransaction(userId, scope, 'knowledge.updated', id, async (session) => {
      if (dto.isRequired === true) await this.assertRules(knowledge, scope, [], undefined, session)
      return this.withDuplicateError(() =>
        this.knowledgeModel
          .findOneAndUpdate(
            {
              _id: id,
              spaceId: knowledge.spaceId ?? { $exists: false },
              ...(scope.enterpriseId
                ? { enterpriseId: new Types.ObjectId(scope.enterpriseId) }
                : personalCreatorFilter(userId)),
            },
            { ...dto, ...(dto.name !== undefined ? { name: this.normalizeName(dto.name) } : {}) },
            { new: true, runValidators: true, session },
          )
          .exec(),
      )
    })
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
    confirmInheritance = false,
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
    const storedItems = await this.ruleTransaction(
      userId,
      scope,
      'knowledge.items_imported',
      knowledgeId,
      async (session) => {
        await this.assertRules(
          knowledge,
          scope,
          items.map((item, index) => ({
            ...item,
            id: `import:${index}`,
            metadata: { inheritanceConfirmed: confirmInheritance },
          })),
          undefined,
          session,
        )
        const stored: KnowledgeItemDocument[] = []
        for (const [index, payload] of items.entries()) {
          const importKey = createHash('sha256')
            .update(JSON.stringify([batchId, index]))
            .digest('hex')
          const filter = { knowledgeId: knowledge._id, importKey }
          const document = this.scopedItemData(userId, knowledge, scope, {
            ...payload,
            sourceType: 'import',
            metadata: { importBatchId: batchId, inheritanceConfirmed: confirmInheritance },
          })
          let item: KnowledgeItemDocument | null
          try {
            item = await this.knowledgeItemModel.findOneAndUpdate(
              filter,
              { $setOnInsert: { ...document, importKey } },
              { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session },
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
          stored.push(item)
        }
        return stored
      },
    )
    const results = []
    for (const item of storedItems) results.push(await this.syncItemVector(item, scope))
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
    sourceSpaceId?: string,
  ) {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    if (sourceSpaceId && knowledge.spaceId !== sourceSpaceId)
      throw new BadRequestException('素材只能保存到同一空间的知识库，请先上传到目标空间')
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
    assertObjectId(itemId)
    const item = await this.ruleTransaction(
      userId,
      scope,
      'knowledge.item_updated',
      itemId,
      async (session) => {
        const previous = await this.knowledgeItemModel.findOne(
          { _id: itemId, knowledgeId: knowledge._id },
          null,
          { session },
        )
        if (!previous) throw new NotFoundException('知识项不存在或无权访问')
        const metadata =
          dto.content !== undefined
            ? {
                ...previous.metadata,
                ...dto.metadata,
                inheritanceConfirmed: dto.metadata?.inheritanceConfirmed === true,
              }
            : (dto.metadata ?? previous.metadata)
        if ((dto.status ?? previous.status) === 'active')
          await this.assertRules(
            knowledge,
            scope,
            [{ ...previous.toObject(), ...dto, metadata, id: itemId }],
            itemId,
            session,
          )
        return this.knowledgeItemModel.findOneAndUpdate(
          { _id: itemId, knowledgeId: knowledge._id },
          { ...dto, ...(dto.content !== undefined ? { metadata } : {}) },
          {
            new: true,
            runValidators: true,
            session,
          },
        )
      },
    )
    if (item) await this.syncItemVector(item, scope)
    return item
  }

  async removeItem(userId: string, knowledgeId: string, itemId: string) {
    const knowledge = await this.findKnowledgeById(userId, knowledgeId)
    const scope = await this.assertCanManage(userId, knowledge)
    const item = await this.findItem(userId, knowledgeId, itemId)
    await this.ruleTransaction(userId, scope, 'knowledge.item_deleted', itemId, async (session) => {
      await removeKnowledgeVectors(knowledgeId, itemId)
      await this.knowledgeItemModel.findOneAndDelete(
        { _id: item._id, knowledgeId: knowledge._id },
        { session },
      )
    })
    return { success: true }
  }

  async remove(userId: string, id: string) {
    const knowledge = await this.findKnowledgeById(userId, id)
    const scope = await this.assertCanManage(userId, knowledge)
    await this.ruleTransaction(userId, scope, 'knowledge.deleted', id, async (session) => {
      await removeKnowledgeVectors(id)
      await this.knowledgeItemModel.deleteMany({ knowledgeId: knowledge._id }, { session })
      await this.knowledgeModel.findOneAndDelete(
        { _id: knowledge._id, spaceId: knowledge.spaceId },
        { session },
      )
    })
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
    return this.ruleTransaction(
      userId,
      scope,
      'knowledge.item_created',
      knowledge._id.toString(),
      async (session) => {
        await this.assertRules(knowledge, scope, [{ ...payload, id: 'new' }], undefined, session)
        if (!session)
          return this.knowledgeItemModel.create(
            this.scopedItemData(userId, knowledge, scope, payload),
          )
        const [item] = await this.knowledgeItemModel.create(
          [this.scopedItemData(userId, knowledge, scope, payload)],
          { session },
        )
        return item
      },
    )
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

  private async ruleTransaction<T>(
    userId: string,
    scope: KnowledgeScope,
    action: string,
    resourceId: string,
    operation: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (scope.spaceType === 'personal') return operation()
    // 与成员/状态变更复用企业事务锁，防止并发规则写入各自通过过期校验。
    return this.orgService.memberships.transaction(scope.enterpriseId!, async (session) => {
      await this.orgService.authorization.assertCanManageKnowledge(userId, scope.spaceId, session)
      const result = await operation(session)
      const id =
        (action === 'knowledge.created' || action === 'knowledge.item_created') &&
        result &&
        typeof result === 'object' &&
        '_id' in result
          ? String(result._id)
          : resourceId
      await this.orgService.activity.record(
        userId,
        scope,
        action,
        action.includes('item_') ? 'knowledgeItem' : 'knowledge',
        id,
        {},
        session,
      )
      return result
    })
  }

  private async assertRules(
    knowledge: KnowledgeDocument,
    scope: KnowledgeScope,
    candidates: Array<{
      id: string
      title: string
      content: string
      constraintLevel?: KnowledgeImportItem['constraintLevel']
      metadata?: Record<string, unknown>
    }>,
    excludeId?: string,
    session?: ClientSession,
  ): Promise<void> {
    if (scope.spaceType === 'personal') return
    const bases = await this.knowledgeModel.find(
      {
        enterpriseId: new Types.ObjectId(scope.enterpriseId),
        ...(scope.spaceType === 'team'
          ? { $or: [{ spaceId: scope.spaceId }, { spaceType: 'enterprise', isRequired: true }] }
          : {}),
      },
      null,
      { session },
    )
    const baseById = new Map(bases.map((base) => [base._id.toString(), base]))
    const items = await this.knowledgeItemModel.find(
      {
        knowledgeId: { $in: bases.map((base) => base._id) },
        status: 'active',
        ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
      },
      null,
      { session },
    )
    const rules: ScopedKnowledgeRule[] = items.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      description: item.content,
      level: item.constraintLevel ?? 'recommended',
      sourceSpaceType: baseById.get(item.knowledgeId.toString())!.spaceType ?? 'enterprise',
      sourceSpaceId: baseById.get(item.knowledgeId.toString())!.spaceId ?? scope.enterpriseId!,
    }))
    const proposed = candidates.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.content,
      sourceKnowledgeBaseId: knowledge._id.toString(),
      level: item.constraintLevel ?? 'recommended',
      sourceSpaceType: scope.spaceType,
      sourceSpaceId: scope.spaceId,
    }))
    const result = mergeKnowledgeRules([...rules, ...proposed])
    if (result.conflicts.length) throw new ConflictException(result.conflicts.join('；'))
    const unconfirmed = proposed.filter(
      (rule, index) =>
        result.warnings.some((warning) => warning.includes(`「${rule.title}」`)) &&
        candidates[index].metadata?.inheritanceConfirmed !== true,
    )
    if (unconfirmed.length)
      throw new ConflictException(
        '自然语言规则无法自动判定冲突；请核对企业/团队强制规则并勾选人工确认后重试',
      )
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
    const knowledge = await this.knowledgeModel.findOne(
      {
        _id: id,
        $or: [
          { spaceId: 'personal', ...personalCreatorFilter(userId) },
          { spaceId: { $ne: 'personal' }, spaceType: { $ne: 'personal' } },
        ],
      },
      { spaceId: 1, spaceType: 1, enterpriseId: 1, creatorId: 1 },
    )
    if (!knowledge) throw new NotFoundException('知识库不存在或无权访问')
    const scope = await this.assertKnowledgeAccess(userId, knowledge)
    const authorizedKnowledge = await this.knowledgeModel.findOne({
      _id: id,
      ...(scope.spaceType === 'personal'
        ? { spaceId: 'personal', ...personalCreatorFilter(userId) }
        : {
            spaceId: knowledge.spaceId ?? { $exists: false },
            enterpriseId: new Types.ObjectId(scope.enterpriseId),
          }),
    })
    if (!authorizedKnowledge) throw new NotFoundException('知识库不存在或归属已变化')
    return authorizedKnowledge
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
    await this.orgService.authorization.assertCanManageKnowledge(userId, scope.spaceId)
    return scope
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
        : { spaceId: scope.spaceId, enterpriseId: new Types.ObjectId(scope.enterpriseId) }
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
        },
        { spaceId: 'personal', ...personalCreatorFilter(scope.ownerId.toString()) },
      ],
    }
  }
}
